function Invoke-SLGraphRequest {
    <#
    .SYNOPSIS
        Thin wrapper around Invoke-MgGraphRequest with retry, pagination, version support,
        and lazy auto-connect.
    .DESCRIPTION
        If Graph is not yet connected, automatically connects using the stored
        TenantId and UseDeviceCode preferences from the module connection state.
        This enables a compliance-first connection flow where Graph is deferred
        until a function actually needs it.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateSet('GET', 'POST', 'PATCH', 'PUT', 'DELETE')]
        [string]$Method,

        [Parameter(Mandatory)]
        [string]$Uri,

        [hashtable]$Body,

        [ValidateSet('v1.0', 'beta')]
        [string]$ApiVersion = 'v1.0',

        [int]$MaxRetries = 3,

        [switch]$AutoPaginate,

        [switch]$AsJson
    )

    # Lazy auto-connect: if Graph is not connected, connect now.
    # The heavy Graph module import was pre-warmed in a background thread
    # at module load time (see StableLabel.psm1). Wait for that job first
    # so we don't pay the 10-30s assembly loading penalty here.
    if (-not $script:SLConnection['GraphConnected']) {
        Write-Host ''
        Write-Host 'This operation requires Microsoft Graph.' -ForegroundColor Cyan

        # Wait for pre-warm job if it's still running
        if ($script:SLGraphPreWarmJob) {
            $jobState = $script:SLGraphPreWarmJob.State
            if ($jobState -eq 'Running') {
                Write-Host 'Loading Graph module (pre-warming in background)...' -ForegroundColor Yellow -NoNewline
                $waitStart = [datetime]::UtcNow
                while ($script:SLGraphPreWarmJob.State -eq 'Running') {
                    $elapsed = ([datetime]::UtcNow - $waitStart).TotalSeconds
                    Write-Host '.' -ForegroundColor Yellow -NoNewline
                    if ($elapsed -gt 60) {
                        Write-Host '' # newline
                        Write-Warning 'Graph module pre-warm is taking longer than expected. Continuing with direct import.'
                        break
                    }
                    Start-Sleep -Milliseconds 500
                }
                Write-Host '' # newline after dots
            }
            if ($script:SLGraphPreWarmJob.State -eq 'Completed') {
                Write-Host 'Graph module ready (pre-warmed).' -ForegroundColor Green
            }
            elseif ($script:SLGraphPreWarmJob.State -eq 'Failed') {
                $jobError = $script:SLGraphPreWarmJob | Receive-Job -ErrorAction SilentlyContinue 2>&1
                Write-Verbose "Graph pre-warm failed: $jobError"
            }
            # Clean up the job
            $script:SLGraphPreWarmJob | Remove-Job -Force -ErrorAction SilentlyContinue
            $script:SLGraphPreWarmJob = $null
        }

        # Import the module into the current session (fast if pre-warm loaded assemblies,
        # or does a cold import if pre-warm was skipped/failed)
        $graphMod = Get-Module -Name 'Microsoft.Graph.Authentication'
        if (-not $graphMod) {
            $available = Get-Module -ListAvailable -Name 'Microsoft.Graph.Authentication' |
                Where-Object { $_.Version -ge [version]'2.10.0' } |
                Sort-Object Version -Descending |
                Select-Object -First 1

            if (-not $available) {
                Write-Host 'Installing Microsoft.Graph.Authentication module...' -ForegroundColor Yellow
                Install-Module -Name 'Microsoft.Graph.Authentication' -MinimumVersion '2.10.0' `
                    -Scope CurrentUser -Force -AllowClobber -ErrorAction Stop
            }

            Write-Host 'Importing Graph module...' -ForegroundColor Yellow -NoNewline
            Import-Module 'Microsoft.Graph.Authentication' -MinimumVersion '2.10.0' -ErrorAction Stop
            Write-Host ' done.' -ForegroundColor Green
        }

        Write-Host 'Connecting to Microsoft Graph...' -ForegroundColor Yellow
        $graphParams = @{}
        if ($script:SLConnection['TenantId']) {
            $graphParams['TenantId'] = $script:SLConnection['TenantId']
        }
        if ($script:SLConnection['UseDeviceCode']) {
            $graphParams['UseDeviceCode'] = $true
            Write-Host '(Device code authentication — check for a sign-in prompt)' -ForegroundColor Cyan
        }

        Connect-SLGraph @graphParams -ErrorAction Stop
        Write-Host 'Graph connected.' -ForegroundColor Green
        Write-Host ''
    }

    $fullUri = "$($script:SLConfig.GraphBaseUrl)/$ApiVersion/$($Uri.TrimStart('/'))"

    $result = Invoke-SLWithRetry -MaxRetries $MaxRetries -OperationName "Graph $Method $Uri" -ScriptBlock {
        $params = @{
            Method = $Method
            Uri    = $fullUri
        }
        if ($Body) {
            $params['Body'] = ($Body | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth)
            $params['ContentType'] = 'application/json'
        }
        Invoke-MgGraphRequest @params
    }

    if ($AutoPaginate -and $result.'@odata.nextLink') {
        $allValues = [System.Collections.Generic.List[object]]::new()

        if ($result.value) {
            $allValues.AddRange([object[]]$result.value)
        }

        $nextLink = $result.'@odata.nextLink'
        while ($nextLink) {
            $page = Invoke-SLWithRetry -MaxRetries $MaxRetries -OperationName "Graph pagination" -ScriptBlock {
                Invoke-MgGraphRequest -Method GET -Uri $nextLink
            }

            if ($page.value) {
                $allValues.AddRange([object[]]$page.value)
            }

            $nextLink = $page.'@odata.nextLink'
        }

        return $allValues
    }

    if ($result.value -and -not $result.'@odata.nextLink') {
        return $result.value
    }

    return $result
}
