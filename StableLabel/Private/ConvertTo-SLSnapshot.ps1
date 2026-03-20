function ConvertTo-SLSnapshot {
    <#
    .SYNOPSIS
        Normalizes live or file-based data into a comparable snapshot structure.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [hashtable]$Data,

        [string]$Name,

        [string]$Scope = 'All'
    )

    [ordered]@{
        SnapshotId    = "sl-snap-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        Name          = $Name
        CreatedAt     = (Get-Date).ToUniversalTime().ToString('o')
        CreatedBy     = ($script:SLConnection.UserPrincipalName ?? '(unknown)')
        TenantId      = ($script:SLConnection.TenantId ?? '(unknown)')
        Scope         = $Scope
        ModuleVersion = (Get-Module StableLabel).Version.ToString()
        Data          = $Data
    }
}
