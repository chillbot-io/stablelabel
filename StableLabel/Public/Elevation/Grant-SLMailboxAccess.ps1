function Grant-SLMailboxAccess {
    <#
    .SYNOPSIS
        Grants mailbox access permissions to a user via Compliance PowerShell.
    .DESCRIPTION
        Wraps Add-MailboxPermission via Invoke-SLComplianceCommand to grant
        a user access to a specified mailbox. Supports FullAccess and
        ReadPermission access rights.
    .PARAMETER Identity
        The identity of the mailbox to grant access to (e.g., UPN or alias).
    .PARAMETER User
        The user principal name of the user to grant access.
    .PARAMETER AccessRights
        The access rights to grant. Valid values are FullAccess and ReadPermission.
        Defaults to FullAccess.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Grant-SLMailboxAccess -Identity 'shared@contoso.com' -User 'admin@contoso.com'
    .EXAMPLE
        Grant-SLMailboxAccess -Identity 'shared@contoso.com' -User 'admin@contoso.com' -AccessRights ReadPermission
    .EXAMPLE
        Grant-SLMailboxAccess -Identity 'shared@contoso.com' -User 'admin@contoso.com' -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [ValidateNotNullOrEmpty()]
        [string]$Identity,

        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$User,

        [ValidateSet('FullAccess', 'ReadPermission')]
        [string]$AccessRights = 'FullAccess',

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        $target = "mailbox '$Identity', user '$User'"
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        $detail = @{
            Identity      = $Identity
            User          = $User
            AccessRights  = $AccessRights
            ElevationType = [SLElevationType]::MailboxAccess
        }

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'Grant-MailboxAccess' -Target $target -Detail $detail -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action       = 'Grant-MailboxAccess'
                Identity     = $Identity
                User         = $User
                AccessRights = $AccessRights
                DryRun       = $true
            }

            if ($AsJson) {
                return $dryRunResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }
            return $dryRunResult
        }

        if (-not $PSCmdlet.ShouldProcess($target, "Grant $AccessRights mailbox permission")) {
            return
        }

        try {
            Write-Verbose "Granting '$AccessRights' on mailbox '$Identity' to '$User'."

            $permResult = Invoke-SLComplianceCommand -OperationName "Add-MailboxPermission '$Identity'" -ScriptBlock {
                Add-MailboxPermission -Identity $Identity -User $User -AccessRights $AccessRights
            }

            Write-SLAuditEntry -Action 'Grant-MailboxAccess' -Target $target -Detail $detail -Result 'success'

            $result = [PSCustomObject]@{
                Action       = 'Grant-MailboxAccess'
                Identity     = $Identity
                User         = $User
                AccessRights = $AccessRights
                Result       = $permResult
            }

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'Grant-MailboxAccess' -Target $target -Detail $detail -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
