function Set-SLSensitiveInfoType {
    <#
    .SYNOPSIS
        Modifies an existing custom sensitive information type in Security & Compliance Center.
    .DESCRIPTION
        Wraps the Set-DlpSensitiveInformationType cmdlet via Invoke-SLComplianceCommand.
        Updates a custom sensitive information type with the specified settings.
        Note: This cmdlet is limited and is typically used to update custom sensitive info types.
    .PARAMETER Identity
        The name or GUID of the sensitive information type to modify.
    .PARAMETER Description
        An updated description for the sensitive information type.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Set-SLSensitiveInfoType -Identity 'Contoso Employee ID' -Description 'Updated pattern for employee IDs'
    .EXAMPLE
        Set-SLSensitiveInfoType -Identity 'Contoso Employee ID' -Description 'Test update' -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [ValidateNotNullOrEmpty()]
        [string]$Identity,

        [string]$Description,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        $detail = @{
            Description = $Description
        }

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'Set-DlpSensitiveInformationType' -Target $Identity -Detail $detail -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action      = 'Set-DlpSensitiveInformationType'
                Identity    = $Identity
                Description = $Description
                DryRun      = $true
            }

            if ($AsJson) {
                return $dryRunResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }
            return $dryRunResult
        }

        if (-not $PSCmdlet.ShouldProcess($Identity, 'Modify sensitive information type')) {
            return
        }

        try {
            Write-Verbose "Updating sensitive information type: $Identity"

            $params = @{ Identity = $Identity }
            if ($Description) { $params['Description'] = $Description }

            $result = Invoke-SLComplianceCommand -OperationName "Set-DlpSensitiveInformationType '$Identity'" -ScriptBlock {
                Set-DlpSensitiveInformationType @params
            }

            Write-SLAuditEntry -Action 'Set-DlpSensitiveInformationType' -Target $Identity -Detail $detail -Result 'success'

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'Set-DlpSensitiveInformationType' -Target $Identity -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
