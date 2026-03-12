function Start-SLElevatedJob {
    <#
    .SYNOPSIS
        Starts an elevated access job with separate GA authentication, Super User,
        and temporary Site Admin privileges.
    .DESCRIPTION
        Orchestrates a per-job elevated access session for compliance operations
        that require Global Administrator + Security/Compliance Administrator roles.

        The workflow:
        1. Opens an interactive Microsoft Graph authentication prompt for the GA account
           (separate session from the main StableLabel connection)
        2. Connects to AIPService (Protection) with the GA credentials
        3. Enables Super User feature for protected content access
        4. Grants temporary Site Admin on each specified site
        5. Records all elevations in elevation-state.json for tracking and crash recovery

        Use Invoke-SLElevatedAction to run operations within the job context.
        Use Stop-SLElevatedJob to tear down all elevations (also called automatically
        by Invoke-SLElevatedAction on completion or failure).
    .PARAMETER SiteUrls
        One or more SharePoint site URLs to grant temporary Site Admin access to.
    .PARAMETER UserPrincipalName
        The UPN of the GA account that will be used for elevation. This account
        must have Global Administrator and Security & Compliance Administrator roles.
    .PARAMETER TenantId
        Optional tenant ID for the GA authentication. If omitted, the default
        tenant for the signed-in account is used.
    .PARAMETER SkipSuperUser
        Skip enabling Super User. Use when only Site Admin elevation is needed.
    .PARAMETER SkipSiteAdmin
        Skip granting Site Admin. Use when only Super User elevation is needed.
    .PARAMETER DryRun
        Simulate the entire elevation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        $job = Start-SLElevatedJob -SiteUrls 'https://contoso.sharepoint.com/sites/hr' -UserPrincipalName 'ga@contoso.com'
    .EXAMPLE
        $job = Start-SLElevatedJob -SiteUrls @('https://contoso.sharepoint.com/sites/hr','https://contoso.sharepoint.com/sites/legal') -UserPrincipalName 'ga@contoso.com' -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter()]
        [string[]]$SiteUrls,

        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$UserPrincipalName,

        [string]$TenantId,

        [switch]$SkipSuperUser,

        [switch]$SkipSiteAdmin,

        [switch]$DryRun,

        [switch]$AsJson
    )

    process {
        $jobId = "SLJob-$(Get-Date -Format 'yyyyMMdd-HHmmss')-$([guid]::NewGuid().ToString('N').Substring(0,8))"
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        $jobState = @{
            JobId              = $jobId
            UserPrincipalName  = $UserPrincipalName
            StartedAt          = [datetime]::UtcNow.ToString('o')
            Status             = 'Starting'
            Elevations         = [System.Collections.Generic.List[hashtable]]::new()
            SiteUrls           = @($SiteUrls)
            DryRun             = $isDryRun
        }

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'Start-ElevatedJob' -Target $jobId -Detail @{
                UserPrincipalName = $UserPrincipalName
                SiteUrls          = $SiteUrls
                SkipSuperUser     = $SkipSuperUser.IsPresent
                SkipSiteAdmin     = $SkipSiteAdmin.IsPresent
            } -Result 'dry-run'

            $jobState['Status'] = 'DryRun'

            if (-not $SkipSuperUser) {
                $jobState['Elevations'].Add(@{
                    Type        = 'SuperUser'
                    Status      = 'DryRun'
                    ActivatedAt = [datetime]::UtcNow.ToString('o')
                })
            }

            foreach ($siteUrl in $SiteUrls) {
                if (-not $SkipSiteAdmin) {
                    $jobState['Elevations'].Add(@{
                        Type        = 'SiteAdmin'
                        SiteUrl     = $siteUrl
                        Status      = 'DryRun'
                        ActivatedAt = [datetime]::UtcNow.ToString('o')
                    })
                }
            }

            $result = [PSCustomObject]$jobState

            # Store in module scope for Invoke-SLElevatedAction
            $script:SLActiveJob = $jobState

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }
            return $result
        }

        if (-not $PSCmdlet.ShouldProcess(
            "GA: $UserPrincipalName, Sites: $($SiteUrls -join ', ')",
            'Start elevated access job (Super User + Site Admin)')) {
            return
        }

        try {
            # === Step 1: Separate GA Graph authentication ===
            Write-Verbose "[$jobId] Authenticating GA account: $UserPrincipalName"
            Write-Host "Opening Microsoft authentication prompt for Global Administrator..." -ForegroundColor Cyan

            $gaScopes = @(
                'InformationProtectionPolicy.Read.All'
                'Files.ReadWrite.All'
                'Sites.FullControl.All'
                'User.Read.All'
                'RoleManagement.ReadWrite.Directory'
                'offline_access'
            )

            $gaConnectParams = @{
                Scopes    = $gaScopes
                NoWelcome = $true
            }
            if ($TenantId) { $gaConnectParams['TenantId'] = $TenantId }

            # Disconnect any existing Graph session before GA auth
            try { Disconnect-MgGraph -ErrorAction SilentlyContinue } catch { }

            Connect-MgGraph @gaConnectParams -ErrorAction Stop

            $gaContext = Get-MgContext -ErrorAction Stop

            if ($gaContext.Account -ne $UserPrincipalName) {
                Write-Warning "Authenticated as '$($gaContext.Account)' but expected '$UserPrincipalName'. Proceeding with authenticated account."
            }

            # Store the GA session in module scope (separate from normal connection)
            $script:SLConnection['GraphConnected'] = $true
            $script:SLConnection['UserPrincipalName'] = $gaContext.Account
            $script:SLConnection['TenantId'] = $gaContext.TenantId
            $script:SLConnection['ConnectedAt']['Graph'] = [datetime]::UtcNow

            Write-SLAuditEntry -Action 'Start-ElevatedJob-Auth' -Target $jobId -Detail @{
                UserPrincipalName = $gaContext.Account
                TenantId          = $gaContext.TenantId
            } -Result 'success'

            $jobState['Elevations'].Add(@{
                Type        = 'GraphAuth'
                Account     = $gaContext.Account
                TenantId    = $gaContext.TenantId
                Status      = 'Active'
                ActivatedAt = [datetime]::UtcNow.ToString('o')
            })

            # === Step 2: Enable Super User (if not skipped) ===
            if (-not $SkipSuperUser) {
                Write-Verbose "[$jobId] Enabling Super User feature..."

                # Connect to AIPService if not already connected
                if (-not $script:SLConnection.ProtectionConnected) {
                    Connect-SLProtection
                }

                Enable-SLSuperUser -Confirm:$false

                $jobState['Elevations'].Add(@{
                    Type        = 'SuperUser'
                    Status      = 'Active'
                    ActivatedAt = [datetime]::UtcNow.ToString('o')
                })

                Write-Host "  Super User enabled." -ForegroundColor Green
            }

            # === Step 3: Grant Site Admin on each site ===
            if (-not $SkipSiteAdmin -and $SiteUrls) {
                foreach ($siteUrl in $SiteUrls) {
                    Write-Verbose "[$jobId] Granting Site Admin on: $siteUrl"

                    Grant-SLSiteAdmin -SiteUrl $siteUrl `
                        -UserPrincipalName $gaContext.Account `
                        -Confirm:$false

                    $jobState['Elevations'].Add(@{
                        Type              = 'SiteAdmin'
                        SiteUrl           = $siteUrl
                        UserPrincipalName = $gaContext.Account
                        Status            = 'Active'
                        ActivatedAt       = [datetime]::UtcNow.ToString('o')
                    })

                    Write-Host "  Site Admin granted on: $siteUrl" -ForegroundColor Green
                }
            }

            # === Step 4: Record job state for tracking/recovery ===
            $jobState['Status'] = 'Active'
            Save-SLJobState -JobState $jobState

            # Store in module scope for Invoke-SLElevatedAction
            $script:SLActiveJob = $jobState

            Write-SLAuditEntry -Action 'Start-ElevatedJob' -Target $jobId -Detail @{
                UserPrincipalName = $gaContext.Account
                ElevationCount    = $jobState['Elevations'].Count
                SiteUrls          = $SiteUrls
            } -Result 'success'

            Write-Host "`nElevated job started: $jobId" -ForegroundColor Cyan
            Write-Host "Use Invoke-SLElevatedAction to run operations, or Stop-SLElevatedJob to tear down." -ForegroundColor Gray

            $result = [PSCustomObject]$jobState

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            # If anything fails during setup, attempt cleanup of whatever was elevated
            Write-Warning "[$jobId] Elevation failed. Attempting cleanup of partial elevations..."
            $jobState['Status'] = 'Failed'

            try { Stop-SLElevatedJob -JobId $jobId -Force -ErrorAction SilentlyContinue } catch { }

            Write-SLAuditEntry -Action 'Start-ElevatedJob' -Target $jobId -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}

function Save-SLJobState {
    <#
    .SYNOPSIS
        Persists the current job state to elevation-state.json for crash recovery.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [hashtable]$JobState
    )

    $statePath = $script:SLConfig.ElevationState
    $stateDir = Split-Path -Path $statePath -Parent
    if (-not (Test-Path -Path $stateDir)) {
        New-Item -Path $stateDir -ItemType Directory -Force | Out-Null
    }

    $state = @{}
    if (Test-Path -Path $statePath) {
        try {
            $state = Get-Content -Path $statePath -Raw | ConvertFrom-Json -AsHashtable
        }
        catch {
            $state = @{}
        }
    }

    # Maintain a list of active jobs
    if (-not $state.ContainsKey('ActiveJobs')) {
        $state['ActiveJobs'] = @()
    }

    # Update or add this job
    $existingIdx = -1
    for ($i = 0; $i -lt $state['ActiveJobs'].Count; $i++) {
        if ($state['ActiveJobs'][$i]['JobId'] -eq $JobState['JobId']) {
            $existingIdx = $i
            break
        }
    }

    if ($existingIdx -ge 0) {
        $state['ActiveJobs'][$existingIdx] = $JobState
    }
    else {
        $state['ActiveJobs'] += @($JobState)
    }

    $state | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth |
        Set-Content -Path $statePath -Encoding utf8
}
