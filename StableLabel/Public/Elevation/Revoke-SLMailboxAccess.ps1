function Revoke-SLMailboxAccess {
    <#
    .SYNOPSIS
        Revokes mailbox access permissions from a user via Compliance PowerShell.
    .DESCRIPTION
        Wraps Remove-MailboxPermission via Invoke-SLComplianceCommand to remove
        a user's access to a specified mailbox. The inner call passes -Confirm:$false
        to suppress the native confirmation prompt.
    .PARAMETER Identity
        The identity of the mailbox to revoke access from (e.g., UPN or alias).
    .PARAMETER User
        The user principal name of the user to revoke access from.
    .PARAMETER AccessRights
        The access rights to revoke. Valid values are FullAccess and ReadPermission.
        Defaults to FullAccess.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Revoke-SLMailboxAccess -Identity 'shared@contoso.com' -User 'admin@contoso.com'
    .EXAMPLE
        Revoke-SLMailboxAccess -Identity 'shared@contoso.com' -User 'admin@contoso.com' -AccessRights ReadPermission
    .EXAMPLE
        Revoke-SLMailboxAccess -Identity 'shared@contoso.com' -User 'admin@contoso.com' -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
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
            Write-SLAuditEntry -Action 'Revoke-MailboxAccess' -Target $target -Detail $detail -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action       = 'Revoke-MailboxAccess'
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

        if (-not $PSCmdlet.ShouldProcess($target, "Revoke $AccessRights mailbox permission")) {
            return
        }

        try {
            Write-Verbose "Revoking '$AccessRights' on mailbox '$Identity' from '$User'."

            Invoke-SLComplianceCommand -OperationName "Remove-MailboxPermission '$Identity'" -ScriptBlock {
                Remove-MailboxPermission -Identity $Identity -User $User -AccessRights $AccessRights -Confirm:$false
            }

            Write-SLAuditEntry -Action 'Revoke-MailboxAccess' -Target $target -Detail $detail -Result 'success'

            $result = [PSCustomObject]@{
                Action       = 'Revoke-MailboxAccess'
                Identity     = $Identity
                User         = $User
                AccessRights = $AccessRights
                Revoked      = $true
            }

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'Revoke-MailboxAccess' -Target $target -Detail $detail -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
