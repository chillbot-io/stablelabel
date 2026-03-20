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

    # Lazy auto-connect: if Graph is not connected, connect now
    if (-not $script:SLConnection['GraphConnected']) {
        Write-Verbose 'Graph not connected — initiating lazy auto-connect...'

        # Ensure the Graph module is available
        $graphMod = Get-Module -ListAvailable -Name 'Microsoft.Graph.Authentication' |
            Where-Object { $_.Version -ge [version]'2.10.0' } |
            Sort-Object Version -Descending |
            Select-Object -First 1

        if (-not $graphMod) {
            Write-Verbose 'Installing Microsoft.Graph.Authentication for lazy Graph connection...'
            Install-Module -Name 'Microsoft.Graph.Authentication' -MinimumVersion '2.10.0' `
                -Scope CurrentUser -Force -AllowClobber -ErrorAction Stop
        }

        $graphParams = @{}
        if ($script:SLConnection['TenantId']) {
            $graphParams['TenantId'] = $script:SLConnection['TenantId']
        }
        if ($script:SLConnection['UseDeviceCode']) {
            $graphParams['UseDeviceCode'] = $true
        }

        Connect-SLGraph @graphParams -ErrorAction Stop
        Write-Verbose 'Lazy Graph auto-connect succeeded.'
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
