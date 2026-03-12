function Invoke-SLGraphRequest {
    <#
    .SYNOPSIS
        Thin wrapper around Invoke-MgGraphRequest with retry, pagination, and version support.
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
