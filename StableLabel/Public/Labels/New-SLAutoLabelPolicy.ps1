function New-SLAutoLabelPolicy {
    <#
    .SYNOPSIS
        Creates a new auto-labeling policy in Security & Compliance Center.
    .DESCRIPTION
        Wraps the New-AutoSensitivityLabelPolicy cmdlet via Invoke-SLComplianceCommand.
        Creates an auto-labeling policy with the specified label, locations, and mode.
    .PARAMETER Name
        The name of the new auto-labeling policy.
    .PARAMETER ApplySensitivityLabel
        The name or GUID of the sensitivity label to apply automatically.
    .PARAMETER ExchangeLocation
        Exchange locations to include (e.g., 'All' or specific addresses).
    .PARAMETER SharePointLocation
        SharePoint site URLs to include (e.g., 'All' or specific site URLs).
    .PARAMETER OneDriveLocation
        OneDrive locations to include (e.g., 'All' or specific site URLs).
    .PARAMETER Mode
        The policy mode: TestWithNotifications, TestWithoutNotifications, or Enable.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        New-SLAutoLabelPolicy -Name 'PII Auto-Label' -ApplySensitivityLabel 'Confidential' -ExchangeLocation 'All' -Mode TestWithNotifications
    .EXAMPLE
        New-SLAutoLabelPolicy -Name 'Finance Auto-Label' -ApplySensitivityLabel 'Highly Confidential' -SharePointLocation 'https://contoso.sharepoint.com/sites/finance' -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Name,

        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$ApplySensitivityLabel,

        [string[]]$ExchangeLocation,

        [string[]]$SharePointLocation,

        [string[]]$OneDriveLocation,

        [ValidateSet('TestWithNotifications', 'TestWithoutNotifications', 'Enable')]
        [string]$Mode,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        $detail = @{
            ApplySensitivityLabel = $ApplySensitivityLabel
            ExchangeLocation      = $ExchangeLocation
            SharePointLocation    = $SharePointLocation
            OneDriveLocation      = $OneDriveLocation
            Mode                  = $Mode
        }

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'New-AutoSensitivityLabelPolicy' -Target $Name -Detail $detail -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action                = 'New-AutoSensitivityLabelPolicy'
                Name                  = $Name
                ApplySensitivityLabel = $ApplySensitivityLabel
                ExchangeLocation      = $ExchangeLocation
                SharePointLocation    = $SharePointLocation
                OneDriveLocation      = $OneDriveLocation
                Mode                  = $Mode
                DryRun                = $true
            }

            if ($AsJson) {
                return $dryRunResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }
            return $dryRunResult
        }

        if (-not $PSCmdlet.ShouldProcess($Name, 'Create auto-labeling policy')) {
            return
        }

        try {
            Write-Verbose "Creating auto-labeling policy: $Name"

            $params = @{
                Name                  = $Name
                ApplySensitivityLabel = $ApplySensitivityLabel
            }
            if ($ExchangeLocation)   { $params['ExchangeLocation']   = $ExchangeLocation }
            if ($SharePointLocation) { $params['SharePointLocation'] = $SharePointLocation }
            if ($OneDriveLocation)   { $params['OneDriveLocation']   = $OneDriveLocation }
            if ($Mode)               { $params['Mode']               = $Mode }

            $result = Invoke-SLComplianceCommand -OperationName "New-AutoSensitivityLabelPolicy '$Name'" -ScriptBlock {
                New-AutoSensitivityLabelPolicy @params
            }

            Write-SLAuditEntry -Action 'New-AutoSensitivityLabelPolicy' -Target $Name -Detail $detail -Result 'success'

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'New-AutoSensitivityLabelPolicy' -Target $Name -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
