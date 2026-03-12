function Write-SLAuditEntry {
    <#
    .SYNOPSIS
        Appends an audit record to the local JSONL audit log.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Action,

        [string]$Target = '',

        [hashtable]$Detail = @{},

        [ValidateSet('success', 'skipped', 'failed', 'dry-run')]
        [string]$Result = 'success',

        [string]$ErrorMessage
    )

    $record = [ordered]@{
        timestamp = (Get-Date).ToUniversalTime().ToString('o')
        action    = $Action
        user      = $script:SLConnection.UserPrincipalName
        tenantId  = $script:SLConnection.TenantId
        target    = $Target
        detail    = $Detail
        result    = $Result
    }

    if ($ErrorMessage) {
        $record['error'] = $ErrorMessage
    }

    $json = $record | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth -Compress
    $json | Out-File -FilePath $script:SLConfig.AuditLogPath -Append -Encoding utf8
}
