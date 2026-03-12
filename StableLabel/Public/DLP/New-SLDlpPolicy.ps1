function New-SLDlpPolicy {
    <#
    .SYNOPSIS
        Creates a new DLP compliance policy in Security & Compliance Center.
    .DESCRIPTION
        Wraps the New-DlpCompliancePolicy cmdlet via Invoke-SLComplianceCommand.
        Creates a DLP policy with the specified name, mode, and location settings.
    .PARAMETER Name
        The name of the new DLP policy.
    .PARAMETER Comment
        An optional comment describing the policy.
    .PARAMETER Mode
        The policy mode: Enable, TestWithNotifications, or TestWithoutNotifications.
    .PARAMETER ExchangeLocation
        Exchange locations to include (e.g., 'All' or specific addresses).
    .PARAMETER SharePointLocation
        SharePoint site URLs to include (e.g., 'All' or specific site URLs).
    .PARAMETER OneDriveLocation
        OneDrive locations to include (e.g., 'All' or specific site URLs).
    .PARAMETER TeamsLocation
        Teams locations to include (e.g., 'All' or specific groups).
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        New-SLDlpPolicy -Name 'PII Protection' -ExchangeLocation 'All' -Mode Enable
    .EXAMPLE
        New-SLDlpPolicy -Name 'Test DLP' -SharePointLocation 'All' -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Name,

        [string]$Comment,

        [ValidateSet('Enable', 'TestWithNotifications', 'TestWithoutNotifications')]
        [string]$Mode,

        [string[]]$ExchangeLocation,

        [string[]]$SharePointLocation,

        [string[]]$OneDriveLocation,

        [string[]]$TeamsLocation,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'New-DlpCompliancePolicy' -Target $Name -Detail @{
                Comment            = $Comment
                Mode               = $Mode
                ExchangeLocation   = $ExchangeLocation
                SharePointLocation = $SharePointLocation
                OneDriveLocation   = $OneDriveLocation
                TeamsLocation      = $TeamsLocation
            } -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action             = 'New-DlpCompliancePolicy'
                Name               = $Name
                Comment            = $Comment
                Mode               = $Mode
                ExchangeLocation   = $ExchangeLocation
                SharePointLocation = $SharePointLocation
                OneDriveLocation   = $OneDriveLocation
                TeamsLocation      = $TeamsLocation
                DryRun             = $true
            }

            if ($AsJson) {
                return $dryRunResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }
            return $dryRunResult
        }

        if (-not $PSCmdlet.ShouldProcess($Name, 'Create DLP compliance policy')) {
            return
        }

        try {
            Write-Verbose "Creating DLP policy: $Name"

            $params = @{ Name = $Name }
            if ($Comment)            { $params['Comment']            = $Comment }
            if ($Mode)               { $params['Mode']               = $Mode }
            if ($ExchangeLocation)   { $params['ExchangeLocation']   = $ExchangeLocation }
            if ($SharePointLocation) { $params['SharePointLocation'] = $SharePointLocation }
            if ($OneDriveLocation)   { $params['OneDriveLocation']   = $OneDriveLocation }
            if ($TeamsLocation)      { $params['TeamsLocation']      = $TeamsLocation }

            $result = Invoke-SLComplianceCommand -OperationName "New-DlpCompliancePolicy '$Name'" -ScriptBlock {
                New-DlpCompliancePolicy @params
            }

            Write-SLAuditEntry -Action 'New-DlpCompliancePolicy' -Target $Name -Detail @{
                Comment            = $Comment
                Mode               = $Mode
                ExchangeLocation   = $ExchangeLocation
                SharePointLocation = $SharePointLocation
                OneDriveLocation   = $OneDriveLocation
                TeamsLocation      = $TeamsLocation
            } -Result 'success'

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'New-DlpCompliancePolicy' -Target $Name -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
