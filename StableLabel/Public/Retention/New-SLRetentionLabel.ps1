function New-SLRetentionLabel {
    <#
    .SYNOPSIS
        Creates a new retention label in Security & Compliance Center.
    .DESCRIPTION
        Wraps the New-ComplianceTag cmdlet via Invoke-SLComplianceCommand.
        Creates a retention label with the specified name and optional retention settings.
    .PARAMETER Name
        The name of the new retention label.
    .PARAMETER Comment
        An optional comment describing the retention label.
    .PARAMETER RetentionDuration
        The retention duration in days.
    .PARAMETER RetentionAction
        The action to take when the retention period expires.
    .PARAMETER RetentionType
        The type of retention period calculation.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        New-SLRetentionLabel -Name 'Financial Records' -RetentionDuration 2555 -RetentionAction Keep
    .EXAMPLE
        New-SLRetentionLabel -Name 'Temporary Files' -RetentionDuration 30 -RetentionAction Delete -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Name,

        [string]$Comment,

        [int]$RetentionDuration,

        [ValidateSet('Keep', 'Delete', 'KeepAndDelete')]
        [string]$RetentionAction,

        [ValidateSet('CreationAgeInDays', 'ModificationAgeInDays', 'TaggedAgeInDays')]
        [string]$RetentionType,

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
            RetentionAction   = $RetentionAction
            RetentionType     = $RetentionType
        }

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'New-ComplianceTag' -Target $Name -Detail $detail -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action            = 'New-ComplianceTag'
                Name              = $Name
                Comment           = $Comment
                RetentionDuration = $RetentionDuration
                RetentionAction   = $RetentionAction
                RetentionType     = $RetentionType
                DryRun            = $true
            }

            if ($AsJson) {
                return $dryRunResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }
            return $dryRunResult
        }

        if (-not $PSCmdlet.ShouldProcess($Name, 'Create retention label')) {
            return
        }

        try {
            Write-Verbose "Creating retention label: $Name"

            $params = @{ Name = $Name }
            if ($Comment)           { $params['Comment']           = $Comment }
            if ($RetentionDuration) { $params['RetentionDuration'] = $RetentionDuration }
            if ($RetentionAction)   { $params['RetentionAction']   = $RetentionAction }
            if ($RetentionType)     { $params['RetentionType']     = $RetentionType }

            $result = Invoke-SLComplianceCommand -OperationName "New-ComplianceTag '$Name'" -ScriptBlock {
                New-ComplianceTag @params
            }

            Write-SLAuditEntry -Action 'New-ComplianceTag' -Target $Name -Detail $detail -Result 'success'

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'New-ComplianceTag' -Target $Name -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
