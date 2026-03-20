function Set-SLDocumentLabel {
    <#
    .SYNOPSIS
        Assigns a sensitivity label to a document via Microsoft Graph API.
    .DESCRIPTION
        Calls the assignSensitivityLabel endpoint on a specific drive item
        to apply a sensitivity label. The label can be specified by ID or
        by name (resolved via Resolve-SLLabelName).
    .PARAMETER DriveId
        The ID of the drive containing the document.
    .PARAMETER ItemId
        The ID of the document item within the drive.
    .PARAMETER LabelId
        The GUID of the sensitivity label to assign.
    .PARAMETER LabelName
        The display name of the sensitivity label to assign. Resolved to an ID automatically.
    .PARAMETER Justification
        A justification message for the label assignment.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Set-SLDocumentLabel -DriveId 'b!abc123' -ItemId '01ABC123DEF' -LabelId '00000000-0000-0000-0000-000000000001'
    .EXAMPLE
        Set-SLDocumentLabel -DriveId 'b!abc123' -ItemId '01ABC123DEF' -LabelName 'Confidential' -Justification 'Policy update'
    .EXAMPLE
        Set-SLDocumentLabel -DriveId 'b!abc123' -ItemId '01ABC123DEF' -LabelName 'Internal' -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium', DefaultParameterSetName = 'ById')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$DriveId,

        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemId,

        [Parameter(Mandatory, ParameterSetName = 'ById')]
        [ValidateNotNullOrEmpty()]
        [string]$LabelId,

        [Parameter(Mandatory, ParameterSetName = 'ByName')]
        [ValidateNotNullOrEmpty()]
        [string]$LabelName,

        [string]$Justification,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        # Graph connection is handled lazily by Invoke-SLGraphRequest
    }

    process {
        # Resolve label name to ID if needed
        if ($PSCmdlet.ParameterSetName -eq 'ByName') {
            $labelId = Resolve-SLLabelName -LabelName $LabelName
        }
        else {
            $labelId = $LabelId
        }

        $target = "drive '$DriveId', item '$ItemId'"
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        $detail = @{
            DriveId            = $DriveId
            ItemId             = $ItemId
            SensitivityLabelId = $labelId
            Justification      = $Justification
        }

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'Set-DocumentLabel' -Target $target -Detail $detail -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action             = 'Set-DocumentLabel'
                DriveId            = $DriveId
                ItemId             = $ItemId
                SensitivityLabelId = $labelId
                Justification      = $Justification
            }
            return Format-SLDryRunResult -Result $dryRunResult -AsJson:$AsJson
        }

        if (-not $PSCmdlet.ShouldProcess($target, 'Assign sensitivity label')) {
            return
        }

        try {
            Write-Verbose "Assigning sensitivity label '$labelId' to $target."

            $body = @{
                sensitivityLabelId = $labelId
                assignmentMethod   = 'standard'
                justificationText  = $Justification
            }

            $result = Invoke-SLGraphRequest -Method POST `
                -Uri "/drives/$DriveId/items/$ItemId/assignSensitivityLabel" `
                -Body $body `
                -ApiVersion beta

            Write-SLAuditEntry -Action 'Set-DocumentLabel' -Target $target -Detail $detail -Result 'success'

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'Set-DocumentLabel' -Target $target -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
