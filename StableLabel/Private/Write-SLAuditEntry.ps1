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
        user      = ($script:SLConnection.UserPrincipalName ?? '(unknown)')
        tenantId  = ($script:SLConnection.TenantId ?? '(unknown)')
        target    = $Target
        detail    = $Detail
        result    = $Result
    }

    if ($ErrorMessage) {
        $record['error'] = $ErrorMessage
    }

    $json = $record | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth -Compress
    $auditPath = $script:SLConfig.AuditLogPath
    $isNewFile = -not (Test-Path $auditPath)
    $json | Out-File -FilePath $auditPath -Append -Encoding utf8

    # Set restrictive permissions when the audit log is first created
    if ($isNewFile -and (Test-Path $auditPath)) {
        if ($IsWindows) {
            $acl = Get-Acl -Path $auditPath
            $acl.SetAccessRuleProtection($true, $false)
            $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
                [System.Security.Principal.WindowsIdentity]::GetCurrent().Name,
                'FullControl', 'Allow')
            $acl.AddAccessRule($rule)
            Set-Acl -Path $auditPath -AclObject $acl -ErrorAction SilentlyContinue
        } else {
            chmod 600 $auditPath 2>$null
        }
    }
}
