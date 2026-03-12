function Set-SLRetentionLabel {
    <#
    .SYNOPSIS
        Modifies an existing retention label in Security & Compliance Center.
    .DESCRIPTION
        Wraps the Set-ComplianceTag cmdlet via Invoke-SLComplianceCommand.
        Updates a retention label with the specified settings.
    .PARAMETER Identity
        The name or GUID of the retention label to modify.
    .PARAMETER Comment
        An updated comment for the retention label.
    .PARAMETER RetentionDuration
        The updated retention duration in days.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Set-SLRetentionLabel -Identity 'Financial Records' -Comment 'Updated comment'
    .EXAMPLE
        Set-SLRetentionLabel -Identity 'Financial Records' -RetentionDuration 3650 -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [ValidateNotNullOrEmpty()]
        [string]$Identity,

        [string]$Comment,

        [int]$RetentionDuration,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        $detail = @{
            Comment           = $Comment
            RetentionDuration = $RetentionDuration
        }

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'Set-ComplianceTag' -Target $Identity -Detail $detail -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action            = 'Set-ComplianceTag'
                Identity          = $Identity
                Comment           = $Comment
                RetentionDuration = $RetentionDuration
                DryRun            = $true
            }

            if ($AsJson) {
                return $dryRunResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }
            return $dryRunResult
        }

        if (-not $PSCmdlet.ShouldProcess($Identity, 'Modify retention label')) {
            return
        }

        try {
            Write-Verbose "Updating retention label: $Identity"

            $params = @{ Identity = $Identity }
            if ($Comment)           { $params['Comment']           = $Comment }
            if ($RetentionDuration) { $params['RetentionDuration'] = $RetentionDuration }

            $result = Invoke-SLComplianceCommand -OperationName "Set-ComplianceTag '$Identity'" -ScriptBlock {
                Set-ComplianceTag @params
            }

            Write-SLAuditEntry -Action 'Set-ComplianceTag' -Target $Identity -Detail $detail -Result 'success'

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'Set-ComplianceTag' -Target $Identity -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
