function Set-SLFileShareLabel {
    <#
    .SYNOPSIS
        Applies a sensitivity label to a file on a CIFS/SMB share.
    .DESCRIPTION
        Uses the AIP unified labeling client to assign a sensitivity label to a
        single file on a CIFS/SMB file share. The label can be specified by GUID
        or by display name (resolved via Resolve-SLLabelName). Supports justification
        messages for label downgrades and custom owner assignment.
    .PARAMETER Path
        File path (single file) on a UNC or mapped drive.
    .PARAMETER LabelId
        The GUID of the sensitivity label to assign.
    .PARAMETER LabelName
        The display name of the sensitivity label to assign. Resolved to an ID automatically.
    .PARAMETER Justification
        A justification message, required when downgrading a label.
    .PARAMETER Owner
        Owner email for the label. Defaults to the connected user.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Set-SLFileShareLabel -Path '\\server\share\document.docx' -LabelId '00000000-0000-0000-0000-000000000001'
    .EXAMPLE
        Set-SLFileShareLabel -Path '\\server\share\report.xlsx' -LabelName 'Confidential'
    .EXAMPLE
        Set-SLFileShareLabel -Path 'Z:\Finance\budget.xlsx' -LabelName 'Internal' -Justification 'Policy update' -Owner 'user@contoso.com'
    .EXAMPLE
        Set-SLFileShareLabel -Path '\\server\share\document.docx' -LabelName 'Public' -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium', DefaultParameterSetName = 'ById')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Path,

        [Parameter(Mandatory, ParameterSetName = 'ById')]
        [ValidateNotNullOrEmpty()]
        [string]$LabelId,

        [Parameter(Mandatory, ParameterSetName = 'ByName')]
        [ValidateNotNullOrEmpty()]
        [string]$LabelName,

        [string]$Justification,

        [string]$Owner,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        Assert-SLAipClient
    }

    process {
        # Resolve label name to ID if needed
        if ($PSCmdlet.ParameterSetName -eq 'ByName') {
            $labelId = Resolve-SLLabelName -LabelName $LabelName
        }
        else {
            $labelId = $LabelId
        }

        $target = $Path
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        # Check file type support
        $typeCheck = Test-SLFileTypeSupported -FileName $Path
        if (-not $typeCheck.Supported) {
            Write-Warning "File '$Path' may not support labeling: $($typeCheck.Reason)"
        }

        $detail = @{
            Path               = $Path
            SensitivityLabelId = $labelId
            Justification      = $Justification
            Owner              = $Owner
        }

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'Set-FileShareLabel' -Target $target -Detail $detail -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action             = 'Set-FileShareLabel'
                Path               = $Path
                SensitivityLabelId = $labelId
                Justification      = $Justification
                Owner              = $Owner
                DryRun             = $true
            }

            if ($AsJson) {
                return $dryRunResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }
            return $dryRunResult
        }

        if (-not $PSCmdlet.ShouldProcess($target, 'Assign sensitivity label')) {
            return
        }

        try {
            Write-Verbose "Assigning sensitivity label '$labelId' to '$Path'."

            $splat = @{
                Path    = $Path
                LabelId = $labelId
            }
            if ($Justification) { $splat['JustificationMessage'] = $Justification }
            if ($Owner)         { $splat['Owner'] = $Owner }

            $result = Set-AIPFileLabel @splat

            Write-SLAuditEntry -Action 'Set-FileShareLabel' -Target $target -Detail $detail -Result 'success'

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'Set-FileShareLabel' -Target $target -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
