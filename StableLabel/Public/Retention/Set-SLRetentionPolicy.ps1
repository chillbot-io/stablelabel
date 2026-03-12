function Set-SLRetentionPolicy {
    <#
    .SYNOPSIS
        Modifies an existing retention policy in Security & Compliance Center.
    .DESCRIPTION
        Wraps the Set-RetentionCompliancePolicy cmdlet via Invoke-SLComplianceCommand.
        Updates a retention policy with the specified settings and location changes.
    .PARAMETER Identity
        The name or GUID of the retention policy to modify.
    .PARAMETER Comment
        An updated comment for the policy.
    .PARAMETER Enabled
        Whether the policy is enabled.
    .PARAMETER AddExchangeLocation
        Exchange locations to add to the policy.
    .PARAMETER RemoveExchangeLocation
        Exchange locations to remove from the policy.
    .PARAMETER AddSharePointLocation
        SharePoint locations to add to the policy.
    .PARAMETER RemoveSharePointLocation
        SharePoint locations to remove from the policy.
    .PARAMETER AddOneDriveLocation
        OneDrive locations to add to the policy.
    .PARAMETER RemoveOneDriveLocation
        OneDrive locations to remove from the policy.
    .PARAMETER AddModernGroupLocation
        Microsoft 365 Group locations to add to the policy.
    .PARAMETER RemoveModernGroupLocation
        Microsoft 365 Group locations to remove from the policy.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Set-SLRetentionPolicy -Identity 'Exchange Retention' -Comment 'Updated comment'
    .EXAMPLE
        Set-SLRetentionPolicy -Identity 'Exchange Retention' -AddExchangeLocation 'user@contoso.com' -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [ValidateNotNullOrEmpty()]
        [string]$Identity,

        [string]$Comment,

        [bool]$Enabled,

        [string[]]$AddExchangeLocation,

        [string[]]$RemoveExchangeLocation,

        [string[]]$AddSharePointLocation,

        [string[]]$RemoveSharePointLocation,

        [string[]]$AddOneDriveLocation,

        [string[]]$RemoveOneDriveLocation,

        [string[]]$AddModernGroupLocation,

        [string[]]$RemoveModernGroupLocation,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        $detail = @{
            Comment                   = $Comment
            Enabled                   = $Enabled
            AddExchangeLocation       = $AddExchangeLocation
            RemoveExchangeLocation    = $RemoveExchangeLocation
            AddSharePointLocation     = $AddSharePointLocation
            RemoveSharePointLocation  = $RemoveSharePointLocation
            AddOneDriveLocation       = $AddOneDriveLocation
            RemoveOneDriveLocation    = $RemoveOneDriveLocation
            AddModernGroupLocation    = $AddModernGroupLocation
            RemoveModernGroupLocation = $RemoveModernGroupLocation
        }

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'Set-RetentionCompliancePolicy' -Target $Identity -Detail $detail -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action                    = 'Set-RetentionCompliancePolicy'
                Identity                  = $Identity
                Comment                   = $Comment
                Enabled                   = $Enabled
                AddExchangeLocation       = $AddExchangeLocation
                RemoveExchangeLocation    = $RemoveExchangeLocation
                AddSharePointLocation     = $AddSharePointLocation
                RemoveSharePointLocation  = $RemoveSharePointLocation
                AddOneDriveLocation       = $AddOneDriveLocation
                RemoveOneDriveLocation    = $RemoveOneDriveLocation
                AddModernGroupLocation    = $AddModernGroupLocation
                RemoveModernGroupLocation = $RemoveModernGroupLocation
                DryRun                    = $true
            }

            if ($AsJson) {
                return $dryRunResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }
            return $dryRunResult
        }

        if (-not $PSCmdlet.ShouldProcess($Identity, 'Modify retention policy')) {
            return
        }

        try {
            Write-Verbose "Updating retention policy: $Identity"

            $params = @{ Identity = $Identity }
            if ($Comment)                   { $params['Comment']                   = $Comment }
            if ($PSBoundParameters.ContainsKey('Enabled')) { $params['Enabled']    = $Enabled }
            if ($AddExchangeLocation)       { $params['AddExchangeLocation']       = $AddExchangeLocation }
            if ($RemoveExchangeLocation)    { $params['RemoveExchangeLocation']    = $RemoveExchangeLocation }
            if ($AddSharePointLocation)     { $params['AddSharePointLocation']     = $AddSharePointLocation }
            if ($RemoveSharePointLocation)  { $params['RemoveSharePointLocation']  = $RemoveSharePointLocation }
            if ($AddOneDriveLocation)       { $params['AddOneDriveLocation']       = $AddOneDriveLocation }
            if ($RemoveOneDriveLocation)    { $params['RemoveOneDriveLocation']    = $RemoveOneDriveLocation }
            if ($AddModernGroupLocation)    { $params['AddModernGroupLocation']    = $AddModernGroupLocation }
            if ($RemoveModernGroupLocation) { $params['RemoveModernGroupLocation'] = $RemoveModernGroupLocation }

            $result = Invoke-SLComplianceCommand -OperationName "Set-RetentionCompliancePolicy '$Identity'" -ScriptBlock {
                Set-RetentionCompliancePolicy @params
            }

            Write-SLAuditEntry -Action 'Set-RetentionCompliancePolicy' -Target $Identity -Detail $detail -Result 'success'

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'Set-RetentionCompliancePolicy' -Target $Identity -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
