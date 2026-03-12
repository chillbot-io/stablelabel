function Get-SLActivityReport {
    <#
    .SYNOPSIS
        Retrieves compliance activity data from the Unified Audit Log.
    .DESCRIPTION
        Queries the Security & Compliance Center Unified Audit Log for
        compliance-related activity. Supports three report types:
          - LabelActivity: sensitivity label application events.
          - DlpIncidents: DLP policy match events.
          - RetentionActions: MIP label / retention action events.
        Results are filtered by the specified date range.
    .PARAMETER ReportType
        The type of activity report to retrieve. Valid values are
        LabelActivity, DlpIncidents, and RetentionActions.
    .PARAMETER StartDate
        The start of the date range to query. Defaults to 30 days ago.
    .PARAMETER EndDate
        The end of the date range to query. Defaults to the current date and time.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLActivityReport -ReportType LabelActivity
    .EXAMPLE
        Get-SLActivityReport -ReportType DlpIncidents -StartDate (Get-Date).AddDays(-7)
    .EXAMPLE
        Get-SLActivityReport -ReportType RetentionActions -AsJson
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateSet('LabelActivity', 'DlpIncidents', 'RetentionActions')]
        [string]$ReportType,

        [datetime]$StartDate = (Get-Date).AddDays(-30),

        [datetime]$EndDate = (Get-Date),

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        try {
            Write-Verbose "Retrieving $ReportType report from $StartDate to $EndDate"

            $recordType = switch ($ReportType) {
                'LabelActivity'   { 'SensitivityLabelAction' }
                'DlpIncidents'    { 'DLP' }
                'RetentionActions' { 'MIPLabel' }
            }

            $result = Invoke-SLComplianceCommand -OperationName "Search-UnifiedAuditLog ($ReportType)" -ScriptBlock {
                Search-UnifiedAuditLog -RecordType $recordType -StartDate $StartDate -EndDate $EndDate
            }

            Write-SLAuditEntry -Action 'Get-SLActivityReport' -Target $ReportType -Detail @{
                StartDate   = $StartDate.ToString('o')
                EndDate     = $EndDate.ToString('o')
                RecordType  = $recordType
                ResultCount = @($result).Count
            } -Result 'success'

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'Get-SLActivityReport' -Target $ReportType -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
