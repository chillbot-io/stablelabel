function Set-SLOnboardingPolicy {
    <#
    .SYNOPSIS
        Sets the Azure Information Protection onboarding control policy.
    .DESCRIPTION
        Wraps Set-AipServiceOnboardingControlPolicy via Invoke-SLProtectionCommand.
        Configures the onboarding control policy to limit which users can use
        Azure Information Protection. This is a Windows-only function requiring
        the AIPService module.
    .PARAMETER UseRmsUserLicense
        Whether to use the RMS user license for onboarding control.
    .PARAMETER SecurityGroupObjectId
        The object ID of the security group to scope onboarding to.
    .PARAMETER Scope
        The scope of the onboarding control policy. Valid values are All or SecurityGroup.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Set-SLOnboardingPolicy -UseRmsUserLicense $true -Scope All
    .EXAMPLE
        Set-SLOnboardingPolicy -Scope SecurityGroup -SecurityGroupObjectId '00000000-0000-0000-0000-000000000001' -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [bool]$UseRmsUserLicense,

        [string]$SecurityGroupObjectId,

        [ValidateSet('All', 'SecurityGroup')]
        [string]$Scope,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Protection
    }

    process {
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        $detail = @{
            UseRmsUserLicense    = $UseRmsUserLicense
            SecurityGroupObjectId = $SecurityGroupObjectId
            Scope                = $Scope
        }

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'Set-AipServiceOnboardingControlPolicy' -Target 'OnboardingPolicy' -Detail $detail -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action                = 'Set-AipServiceOnboardingControlPolicy'
                UseRmsUserLicense     = $UseRmsUserLicense
                SecurityGroupObjectId = $SecurityGroupObjectId
                Scope                 = $Scope
                DryRun                = $true
            }

            if ($AsJson) {
                return $dryRunResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }
            return $dryRunResult
        }

        if (-not $PSCmdlet.ShouldProcess('OnboardingPolicy', 'Set onboarding control policy')) {
            return
        }

        try {
            Write-Verbose 'Updating AIP onboarding control policy.'

            $params = @{}
            if ($PSBoundParameters.ContainsKey('UseRmsUserLicense'))     { $params['UseRmsUserLicense']     = $UseRmsUserLicense }
            if ($PSBoundParameters.ContainsKey('SecurityGroupObjectId')) { $params['SecurityGroupObjectId'] = $SecurityGroupObjectId }
            if ($PSBoundParameters.ContainsKey('Scope'))                 { $params['Scope']                 = $Scope }

            $result = Invoke-SLProtectionCommand -OperationName 'Set-AipServiceOnboardingControlPolicy' -ScriptBlock {
                Set-AipServiceOnboardingControlPolicy @params
            }

            Write-SLAuditEntry -Action 'Set-AipServiceOnboardingControlPolicy' -Target 'OnboardingPolicy' -Detail $detail -Result 'success'

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'Set-AipServiceOnboardingControlPolicy' -Target 'OnboardingPolicy' -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
