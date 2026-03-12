function Get-SLOnboardingPolicy {
    <#
    .SYNOPSIS
        Gets the Azure Information Protection onboarding control policy.
    .DESCRIPTION
        Wraps Get-AipServiceOnboardingControlPolicy via Invoke-SLProtectionCommand.
        Returns the current onboarding control policy settings for the tenant.
        This is a Windows-only function requiring the AIPService module.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLOnboardingPolicy
    .EXAMPLE
        Get-SLOnboardingPolicy -AsJson
    #>
    [CmdletBinding()]
    param(
        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Protection
    }

    process {
        try {
            Write-Verbose 'Retrieving AIP onboarding control policy.'

            $result = Invoke-SLProtectionCommand -OperationName 'Get-AipServiceOnboardingControlPolicy' -ScriptBlock {
                Get-AipServiceOnboardingControlPolicy
            }

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
