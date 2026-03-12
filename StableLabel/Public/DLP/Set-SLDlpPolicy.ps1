function Set-SLDlpPolicy {
    <#
    .SYNOPSIS
        Modifies an existing DLP compliance policy in Security & Compliance Center.
    .DESCRIPTION
        Wraps the Set-DlpCompliancePolicy cmdlet via Invoke-SLComplianceCommand.
        Updates a DLP policy with the specified settings.
    .PARAMETER Identity
        The name or GUID of the DLP policy to modify.
    .PARAMETER Comment
        An updated comment for the policy.
    .PARAMETER Mode
        The policy mode: Enable, TestWithNotifications, or TestWithoutNotifications.
    .PARAMETER AddExchangeLocation
        Exchange locations to add to the policy.
    .PARAMETER RemoveExchangeLocation
        Exchange locations to remove from the policy.
    .PARAMETER AddSharePointLocation
        SharePoint site URLs to add to the policy.
    .PARAMETER RemoveSharePointLocation
        SharePoint site URLs to remove from the policy.
    .PARAMETER AddOneDriveLocation
        OneDrive locations to add to the policy.
    .PARAMETER RemoveOneDriveLocation
        OneDrive locations to remove from the policy.
    .PARAMETER AddTeamsLocation
        Teams locations to add to the policy.
    .PARAMETER RemoveTeamsLocation
        Teams locations to remove from the policy.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Set-SLDlpPolicy -Identity 'PII Protection' -Mode Enable
    .EXAMPLE
        Set-SLDlpPolicy -Identity 'PII Protection' -AddSharePointLocation 'https://contoso.sharepoint.com/sites/hr' -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [ValidateNotNullOrEmpty()]
        [string]$Identity,

        [string]$Comment,

        [ValidateSet('Enable', 'TestWithNotifications', 'TestWithoutNotifications')]
        [string]$Mode,

        [string[]]$AddExchangeLocation,

        [string[]]$RemoveExchangeLocation,

        [string[]]$AddSharePointLocation,

        [string[]]$RemoveSharePointLocation,

        [string[]]$AddOneDriveLocation,

        [string[]]$RemoveOneDriveLocation,

        [string[]]$AddTeamsLocation,

        [string[]]$RemoveTeamsLocation,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        $detail = @{
            Comment                  = $Comment
            Mode                     = $Mode
            AddExchangeLocation      = $AddExchangeLocation
            RemoveExchangeLocation   = $RemoveExchangeLocation
            AddSharePointLocation    = $AddSharePointLocation
            RemoveSharePointLocation = $RemoveSharePointLocation
            AddOneDriveLocation      = $AddOneDriveLocation
            RemoveOneDriveLocation   = $RemoveOneDriveLocation
            AddTeamsLocation         = $AddTeamsLocation
            RemoveTeamsLocation      = $RemoveTeamsLocation
        }

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'Set-DlpCompliancePolicy' -Target $Identity -Detail $detail -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action                   = 'Set-DlpCompliancePolicy'
                Identity                 = $Identity
                Comment                  = $Comment
                Mode                     = $Mode
                AddExchangeLocation      = $AddExchangeLocation
                RemoveExchangeLocation   = $RemoveExchangeLocation
                AddSharePointLocation    = $AddSharePointLocation
                RemoveSharePointLocation = $RemoveSharePointLocation
                AddOneDriveLocation      = $AddOneDriveLocation
                RemoveOneDriveLocation   = $RemoveOneDriveLocation
                AddTeamsLocation         = $AddTeamsLocation
                RemoveTeamsLocation      = $RemoveTeamsLocation
                DryRun                   = $true
            }

            if ($AsJson) {
                return $dryRunResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }
            return $dryRunResult
        }

        if (-not $PSCmdlet.ShouldProcess($Identity, 'Modify DLP compliance policy')) {
            return
        }

        try {
            Write-Verbose "Updating DLP policy: $Identity"

            $params = @{ Identity = $Identity }
            if ($Comment)                  { $params['Comment']                  = $Comment }
            if ($Mode)                     { $params['Mode']                     = $Mode }
            if ($AddExchangeLocation)      { $params['AddExchangeLocation']      = $AddExchangeLocation }
            if ($RemoveExchangeLocation)   { $params['RemoveExchangeLocation']   = $RemoveExchangeLocation }
            if ($AddSharePointLocation)    { $params['AddSharePointLocation']    = $AddSharePointLocation }
            if ($RemoveSharePointLocation) { $params['RemoveSharePointLocation'] = $RemoveSharePointLocation }
            if ($AddOneDriveLocation)      { $params['AddOneDriveLocation']      = $AddOneDriveLocation }
            if ($RemoveOneDriveLocation)   { $params['RemoveOneDriveLocation']   = $RemoveOneDriveLocation }
            if ($AddTeamsLocation)         { $params['AddTeamsLocation']         = $AddTeamsLocation }
            if ($RemoveTeamsLocation)      { $params['RemoveTeamsLocation']      = $RemoveTeamsLocation }

            $result = Invoke-SLComplianceCommand -OperationName "Set-DlpCompliancePolicy '$Identity'" -ScriptBlock {
                Set-DlpCompliancePolicy @params
            }

            Write-SLAuditEntry -Action 'Set-DlpCompliancePolicy' -Target $Identity -Detail $detail -Result 'success'

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'Set-DlpCompliancePolicy' -Target $Identity -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
