function New-SLLabelPolicy {
    <#
    .SYNOPSIS
        Creates a new sensitivity label policy in Security & Compliance Center.
    .DESCRIPTION
        Wraps the New-LabelPolicy cmdlet via Invoke-SLComplianceCommand.
        Creates a label policy with the specified name, labels, and optional settings.
    .PARAMETER Name
        The name of the new label policy.
    .PARAMETER Labels
        An array of sensitivity label names or GUIDs to include in the policy.
    .PARAMETER Comment
        An optional comment describing the policy.
    .PARAMETER AdvancedSettings
        A hashtable of advanced settings to apply to the policy.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        New-SLLabelPolicy -Name 'Finance Policy' -Labels 'Confidential','Internal'
    .EXAMPLE
        New-SLLabelPolicy -Name 'Test Policy' -Labels 'Public' -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Name,

        [Parameter()]
        [ValidateNotNullOrEmpty()]
        [string[]]$Labels,

        [string]$Comment,

        [hashtable]$AdvancedSettings,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'New-LabelPolicy' -Target $Name -Detail @{
                Labels           = $Labels
                Comment          = $Comment
                AdvancedSettings = $AdvancedSettings
            } -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action           = 'New-LabelPolicy'
                Name             = $Name
                Labels           = $Labels
                Comment          = $Comment
                AdvancedSettings = $AdvancedSettings
                DryRun           = $true
            }

            if ($AsJson) {
                return $dryRunResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }
            return $dryRunResult
        }

        if (-not $PSCmdlet.ShouldProcess($Name, 'Create label policy')) {
            return
        }

        try {
            Write-Verbose "Creating label policy: $Name"

            $params = @{ Name = $Name }
            if ($Labels)           { $params['Labels']           = $Labels }
            if ($Comment)          { $params['Comment']          = $Comment }
            if ($AdvancedSettings) { $params['AdvancedSettings'] = $AdvancedSettings }

            $result = Invoke-SLComplianceCommand -OperationName "New-LabelPolicy '$Name'" -ScriptBlock {
                New-LabelPolicy @params
            }

            Write-SLAuditEntry -Action 'New-LabelPolicy' -Target $Name -Detail @{
                Labels           = $Labels
                Comment          = $Comment
                AdvancedSettings = $AdvancedSettings
            } -Result 'success'

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'New-LabelPolicy' -Target $Name -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
