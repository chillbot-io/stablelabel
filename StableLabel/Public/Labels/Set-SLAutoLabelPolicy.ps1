function Set-SLAutoLabelPolicy {
    <#
    .SYNOPSIS
        Modifies an existing auto-labeling policy in Security & Compliance Center.
    .DESCRIPTION
        Wraps the Set-AutoSensitivityLabelPolicy cmdlet via Invoke-SLComplianceCommand.
        Updates an auto-labeling policy with the specified settings.
    .PARAMETER Identity
        The name or GUID of the auto-labeling policy to modify.
    .PARAMETER Mode
        The policy mode: TestWithNotifications, TestWithoutNotifications, or Enable.
    .PARAMETER ApplySensitivityLabel
        The name or GUID of the sensitivity label to apply automatically.
    .PARAMETER ExchangeLocation
        Exchange locations to include (e.g., 'All' or specific addresses).
    .PARAMETER SharePointLocation
        SharePoint site URLs to include (e.g., 'All' or specific site URLs).
    .PARAMETER OneDriveLocation
        OneDrive locations to include (e.g., 'All' or specific site URLs).
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
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Set-SLAutoLabelPolicy -Identity 'PII Auto-Label' -Mode Enable
    .EXAMPLE
        Set-SLAutoLabelPolicy -Identity 'Finance Auto-Label' -AddSharePointLocation 'https://contoso.sharepoint.com/sites/hr' -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [ValidateNotNullOrEmpty()]
        [string]$Identity,

        [ValidateSet('TestWithNotifications', 'TestWithoutNotifications', 'Enable')]
        [string]$Mode,

        [string]$ApplySensitivityLabel,

        [string[]]$ExchangeLocation,

        [string[]]$SharePointLocation,

        [string[]]$OneDriveLocation,

        [string[]]$AddExchangeLocation,

        [string[]]$RemoveExchangeLocation,

        [string[]]$AddSharePointLocation,

        [string[]]$RemoveSharePointLocation,

        [string[]]$AddOneDriveLocation,

        [string[]]$RemoveOneDriveLocation,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        $detail = @{
            Mode                    = $Mode
            ApplySensitivityLabel   = $ApplySensitivityLabel
            ExchangeLocation        = $ExchangeLocation
            SharePointLocation      = $SharePointLocation
            OneDriveLocation        = $OneDriveLocation
            AddExchangeLocation     = $AddExchangeLocation
            RemoveExchangeLocation  = $RemoveExchangeLocation
            AddSharePointLocation   = $AddSharePointLocation
            RemoveSharePointLocation = $RemoveSharePointLocation
            AddOneDriveLocation     = $AddOneDriveLocation
            RemoveOneDriveLocation  = $RemoveOneDriveLocation
        }

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'Set-AutoSensitivityLabelPolicy' -Target $Identity -Detail $detail -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action                   = 'Set-AutoSensitivityLabelPolicy'
                Identity                 = $Identity
                Mode                     = $Mode
                ApplySensitivityLabel    = $ApplySensitivityLabel
                ExchangeLocation         = $ExchangeLocation
                SharePointLocation       = $SharePointLocation
                OneDriveLocation         = $OneDriveLocation
                AddExchangeLocation      = $AddExchangeLocation
                RemoveExchangeLocation   = $RemoveExchangeLocation
                AddSharePointLocation    = $AddSharePointLocation
                RemoveSharePointLocation = $RemoveSharePointLocation
                AddOneDriveLocation      = $AddOneDriveLocation
                RemoveOneDriveLocation   = $RemoveOneDriveLocation
                DryRun                   = $true
            }

            if ($AsJson) {
                return $dryRunResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }
            return $dryRunResult
        }

        if (-not $PSCmdlet.ShouldProcess($Identity, 'Modify auto-labeling policy')) {
            return
        }

        try {
            Write-Verbose "Updating auto-labeling policy: $Identity"

            $params = @{ Identity = $Identity }
            if ($Mode)                    { $params['Mode']                    = $Mode }
            if ($ApplySensitivityLabel)   { $params['ApplySensitivityLabel']   = $ApplySensitivityLabel }
            if ($ExchangeLocation)        { $params['ExchangeLocation']        = $ExchangeLocation }
            if ($SharePointLocation)      { $params['SharePointLocation']      = $SharePointLocation }
            if ($OneDriveLocation)        { $params['OneDriveLocation']        = $OneDriveLocation }
            if ($AddExchangeLocation)     { $params['AddExchangeLocation']     = $AddExchangeLocation }
            if ($RemoveExchangeLocation)  { $params['RemoveExchangeLocation']  = $RemoveExchangeLocation }
            if ($AddSharePointLocation)   { $params['AddSharePointLocation']   = $AddSharePointLocation }
            if ($RemoveSharePointLocation) { $params['RemoveSharePointLocation'] = $RemoveSharePointLocation }
            if ($AddOneDriveLocation)     { $params['AddOneDriveLocation']     = $AddOneDriveLocation }
            if ($RemoveOneDriveLocation)  { $params['RemoveOneDriveLocation']  = $RemoveOneDriveLocation }

            $result = Invoke-SLComplianceCommand -OperationName "Set-AutoSensitivityLabelPolicy '$Identity'" -ScriptBlock {
                Set-AutoSensitivityLabelPolicy @params
            }

            Write-SLAuditEntry -Action 'Set-AutoSensitivityLabelPolicy' -Target $Identity -Detail $detail -Result 'success'

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'Set-AutoSensitivityLabelPolicy' -Target $Identity -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
