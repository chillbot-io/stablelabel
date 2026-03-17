function Connect-SLAll {
    <#
    .SYNOPSIS
        One-click connection: installs prerequisites and connects to Graph + Compliance.
    .DESCRIPTION
        Ensures that the required PowerShell modules (Microsoft.Graph.Authentication
        and ExchangeOnlineManagement) are installed, then connects to Microsoft Graph
        and Security & Compliance in sequence. The user only needs to authenticate
        via the Microsoft sign-in prompts that appear.

        After Graph connects, the UPN from that session is automatically passed to
        Connect-SLCompliance so the user does not need to supply it.
    .PARAMETER TenantId
        Optional Azure AD / Entra ID tenant ID to connect to.
    .PARAMETER SkipPrereqs
        Skip the prerequisite installation check (useful if you know modules are
        already installed and want to save a few seconds).
    .PARAMETER UseDeviceCode
        Use the device-code authentication flow for Microsoft Graph instead of
        interactive browser sign-in. Required when running from the StableLabel
        GUI or other non-interactive environments.
    .PARAMETER AsJson
        Return the result as a JSON string instead of a PSCustomObject.
    .EXAMPLE
        Connect-SLAll
    .EXAMPLE
        Connect-SLAll -TenantId 'contoso.onmicrosoft.com'
    .EXAMPLE
        Connect-SLAll -UseDeviceCode
    #>
    [CmdletBinding()]
    param(
        [Parameter()]
        [string]$TenantId,

        [Parameter()]
        [switch]$SkipPrereqs,

        [Parameter()]
        [switch]$UseDeviceCode,

        [Parameter()]
        [switch]$AsJson
    )

    process {
        $steps = [System.Collections.Generic.List[PSCustomObject]]::new()

        # ── Step 1: Check / install prerequisites ──────────────────────────
        if (-not $SkipPrereqs) {
            $prereqs = @(
                @{ Name = 'Microsoft.Graph.Authentication'; MinVersion = '2.10.0' }
                @{ Name = 'ExchangeOnlineManagement';       MinVersion = '3.2.0'  }
            )

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
                    Write-Verbose "Installing $($mod.Name) (minimum $($mod.MinVersion))..."
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

        # ── Step 2: Connect to Microsoft Graph ────────────────────────────
        try {
            Write-Verbose 'Connecting to Microsoft Graph...'
            $graphParams = @{}
            if ($TenantId) { $graphParams['TenantId'] = $TenantId }
            if ($UseDeviceCode) { $graphParams['UseDeviceCode'] = $true }
            $graphResult = Connect-SLGraph @graphParams -ErrorAction Stop

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
            $result = [PSCustomObject]@{
                Status = 'Failed'
                Stage  = 'Graph'
                Error  = "Graph connection failed: $_"
                Steps  = $steps
            }
            if ($AsJson) { return $result | ConvertTo-Json -Depth 20 }
            return $result
        }

        # ── Step 3: Connect to Security & Compliance ──────────────────────
        $upn = $graphResult.UserPrincipalName
        if (-not $upn) {
            $result = [PSCustomObject]@{
                Status = 'Failed'
                Stage  = 'Compliance'
                Error  = 'Could not determine UPN from Graph connection.'
                Steps  = $steps
            }
            if ($AsJson) { return $result | ConvertTo-Json -Depth 20 }
            return $result
        }

        try {
            Write-Verbose "Connecting to Security & Compliance as $upn..."
            $complianceParams = @{
                UserPrincipalName = $upn
                ErrorAction       = 'Stop'
            }
            if ($UseDeviceCode) {
                $complianceParams['UseDeviceCode'] = $true
            }
            Connect-SLCompliance @complianceParams

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
                Status = 'PartiallyConnected'
                Stage  = 'Compliance'
                Error  = "Compliance connection failed (Graph is connected): $_"
                Steps  = $steps
            }
            if ($AsJson) { return $result | ConvertTo-Json -Depth 20 }
            return $result
        }

        # ── Done ──────────────────────────────────────────────────────────
        $result = [PSCustomObject]@{
            Status            = 'Connected'
            UserPrincipalName = $upn
            TenantId          = $graphResult.TenantId
            GraphConnected    = $true
            ComplianceConnected = $true
            Steps             = $steps
        }

        if ($AsJson) { return $result | ConvertTo-Json -Depth 20 }
        return $result
    }
}
