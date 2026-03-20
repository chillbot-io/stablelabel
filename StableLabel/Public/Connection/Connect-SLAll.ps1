function Connect-SLAll {
    <#
    .SYNOPSIS
        One-click connection: installs prerequisites and connects to Compliance (and optionally Graph).
    .DESCRIPTION
        Ensures that the required PowerShell modules are installed, then connects
        to Security & Compliance Center first (the primary backend for label,
        DLP, and retention operations). Microsoft Graph is connected only when
        -IncludeGraph is specified or when a function that requires it is called
        (lazy auto-connect via Invoke-SLGraphRequest).

        This compliance-first approach avoids the long Graph module import and
        MSAL token-acquisition delays that previously caused connection timeouts.
    .PARAMETER UserPrincipalName
        The UPN of the account to authenticate with. Optional — when provided
        it pre-populates the Compliance sign-in dialog.
    .PARAMETER TenantId
        Optional Azure AD / Entra ID tenant ID to connect to.
    .PARAMETER SkipPrereqs
        Skip the prerequisite installation check (useful if you know modules are
        already installed and want to save a few seconds).
    .PARAMETER UseDeviceCode
        Use the device-code authentication flow instead of interactive browser
        sign-in. Required when running from the StableLabel GUI or other
        non-interactive environments.
    .PARAMETER IncludeGraph
        Also connect to Microsoft Graph during initial connection. By default
        Graph is not connected upfront — it is connected lazily on first use
        by any function that needs it (Documents, Elevation, etc.).
    .PARAMETER AsJson
        Return the result as a JSON string instead of a PSCustomObject.
    .EXAMPLE
        Connect-SLAll
    .EXAMPLE
        Connect-SLAll -UserPrincipalName admin@contoso.com
    .EXAMPLE
        Connect-SLAll -UseDeviceCode
    .EXAMPLE
        Connect-SLAll -IncludeGraph -TenantId 'contoso.onmicrosoft.com'
    #>
    [CmdletBinding()]
    param(
        [Parameter()]
        [string]$UserPrincipalName,

        [Parameter()]
        [string]$TenantId,

        [Parameter()]
        [switch]$SkipPrereqs,

        [Parameter()]
        [switch]$UseDeviceCode,

        [Parameter()]
        [switch]$IncludeGraph,

        [Parameter()]
        [switch]$AsJson
    )

    process {
        $steps = [System.Collections.Generic.List[PSCustomObject]]::new()

        # ── Step 1: Check / install prerequisites ──────────────────────────
        if (-not $SkipPrereqs) {
            $prereqs = @(
                @{ Name = 'ExchangeOnlineManagement'; MinVersion = '3.2.0' }
            )

            # Only check Graph module if we plan to connect it now
            if ($IncludeGraph) {
                $prereqs += @{ Name = 'Microsoft.Graph.Authentication'; MinVersion = '2.10.0' }
            }

            foreach ($mod in $prereqs) {
                $installed = Get-Module -ListAvailable -Name $mod.Name |
                    Where-Object { $_.Version -ge [version]$mod.MinVersion } |
                    Sort-Object Version -Descending |
                    Select-Object -First 1

                if ($installed) {
                    Write-Verbose "$($mod.Name) v$($installed.Version) already installed."
                    $steps.Add([PSCustomObject]@{
                        Step   = 'Prereq'
                        Module = $mod.Name
                        Status = 'AlreadyInstalled'
                        Version = $installed.Version.ToString()
                    })
                }
                else {
                    # Check if a lower version exists
                    $existing = Get-Module -ListAvailable -Name $mod.Name |
                        Sort-Object Version -Descending |
                        Select-Object -First 1

                    if ($existing) {
                        Write-Warning "Upgrading $($mod.Name) from v$($existing.Version) to minimum v$($mod.MinVersion)..."
                    } else {
                        Write-Warning "Installing $($mod.Name) v$($mod.MinVersion) (not currently installed)..."
                    }

                    try {
                        Install-Module -Name $mod.Name -MinimumVersion $mod.MinVersion `
                            -Scope CurrentUser -Force -AllowClobber -ErrorAction Stop
                        $steps.Add([PSCustomObject]@{
                            Step   = 'Prereq'
                            Module = $mod.Name
                            Status = 'Installed'
                            Version = $mod.MinVersion
                        })
                    }
                    catch {
                        $steps.Add([PSCustomObject]@{
                            Step   = 'Prereq'
                            Module = $mod.Name
                            Status = 'Failed'
                            Error  = $_.Exception.Message
                        })
                        $result = [PSCustomObject]@{
                            Status  = 'Failed'
                            Stage   = 'Prerequisites'
                            Error   = "Failed to install $($mod.Name): $_"
                            Steps   = $steps
                        }
                        if ($AsJson) { return $result | ConvertTo-Json -Depth 20 }
                        return $result
                    }
                }
            }
        }

        # ── Step 2: Connect to Security & Compliance (primary) ──────────
        try {
            Write-Verbose 'Connecting to Security & Compliance Center...'
            $complianceParams = @{
                ErrorAction = 'Stop'
            }
            if ($UserPrincipalName) {
                $complianceParams['UserPrincipalName'] = $UserPrincipalName
            }
            if ($UseDeviceCode) {
                $complianceParams['UseDeviceCode'] = $true
            }
            $complianceResult = Connect-SLCompliance @complianceParams

            $upn = if ($UserPrincipalName) { $UserPrincipalName }
                   elseif ($complianceResult.UserPrincipalName) { $complianceResult.UserPrincipalName }
                   else { $script:SLConnection['UserPrincipalName'] }

            $steps.Add([PSCustomObject]@{
                Step   = 'Compliance'
                Status = 'Connected'
                UPN    = $upn
            })
        }
        catch {
            $steps.Add([PSCustomObject]@{
                Step   = 'Compliance'
                Status = 'Failed'
                Error  = $_.Exception.Message
            })
            $result = [PSCustomObject]@{
                Status = 'Failed'
                Stage  = 'Compliance'
                Error  = "Compliance connection failed: $_"
                Steps  = $steps
            }
            if ($AsJson) { return $result | ConvertTo-Json -Depth 20 }
            return $result
        }

        # ── Step 3: Optionally connect to Microsoft Graph ───────────────
        $graphConnected = $false
        $tenantId = $null

        if ($IncludeGraph) {
            try {
                Write-Verbose 'Connecting to Microsoft Graph...'
                $graphParams = @{}
                if ($TenantId) { $graphParams['TenantId'] = $TenantId }
                if ($UseDeviceCode) { $graphParams['UseDeviceCode'] = $true }
                $graphResult = Connect-SLGraph @graphParams -ErrorAction Stop

                $graphConnected = $true
                $tenantId = $graphResult.TenantId

                # If we got a UPN from Graph and didn't have one, use it
                if (-not $upn -and $graphResult.UserPrincipalName) {
                    $upn = $graphResult.UserPrincipalName
                    $script:SLConnection['UserPrincipalName'] = $upn
                }

                $steps.Add([PSCustomObject]@{
                    Step    = 'Graph'
                    Status  = 'Connected'
                    UPN     = $graphResult.UserPrincipalName
                    Tenant  = $graphResult.TenantId
                })
            }
            catch {
                $steps.Add([PSCustomObject]@{
                    Step   = 'Graph'
                    Status = 'Failed'
                    Error  = $_.Exception.Message
                })
                # Graph failure is not fatal — Compliance is connected
                Write-Warning "Graph connection failed (Compliance is connected): $_"
            }
        }
        else {
            # Store TenantId and device-code preference for lazy Graph connection later
            if ($TenantId) {
                $script:SLConnection['TenantId'] = $TenantId
            }
            $script:SLConnection['UseDeviceCode'] = [bool]$UseDeviceCode

            # Check pre-warm status for user feedback
            $preWarmStatus = 'not started'
            if ($script:SLGraphPreWarmJob) {
                $preWarmStatus = $script:SLGraphPreWarmJob.State.ToString().ToLower()
            }

            $steps.Add([PSCustomObject]@{
                Step         = 'Graph'
                Status       = 'Deferred'
                PreWarmState = $preWarmStatus
                Note         = 'Graph module is pre-loading in the background. It will auto-connect on first use.'
            })
        }

        # ── Done ──────────────────────────────────────────────────────────
        $result = [PSCustomObject]@{
            Status              = 'Connected'
            UserPrincipalName   = $upn
            TenantId            = $tenantId
            GraphConnected      = $graphConnected
            ComplianceConnected = $true
            Steps               = $steps
        }

        if ($AsJson) { return $result | ConvertTo-Json -Depth 20 }
        return $result
    }
}
