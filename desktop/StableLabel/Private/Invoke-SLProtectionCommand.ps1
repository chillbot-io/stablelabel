function Invoke-SLProtectionCommand {
    <#
    .SYNOPSIS
        Wraps AIPService cmdlet calls. On non-Windows platforms, throws a clear error.
        On Windows, ensures AIPService module is loaded.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [scriptblock]$ScriptBlock,

        [string]$OperationName = 'Protection command'
    )

    if (-not $IsWindows) {
        throw "AIPService requires Windows PowerShell 5.1 and is not available on $($PSVersionTable.OS). Protection functions are Windows-only."
    }

    Assert-SLConnected -Require Protection

    Invoke-SLWithRetry -MaxRetries 2 -OperationName $OperationName -ScriptBlock $ScriptBlock
}
