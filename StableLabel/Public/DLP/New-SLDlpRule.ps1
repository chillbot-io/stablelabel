function New-SLDlpRule {
    <#
    .SYNOPSIS
        Creates a new DLP compliance rule in Security & Compliance Center.
    .DESCRIPTION
        Wraps the New-DlpComplianceRule cmdlet via Invoke-SLComplianceCommand.
        Creates a DLP rule with the specified name, parent policy, and rule settings.
    .PARAMETER Name
        The name of the new DLP rule.
    .PARAMETER Policy
        The name of the parent DLP policy this rule belongs to.
    .PARAMETER ContentContainsSensitiveInformation
        An array of hashtables defining sensitive information types to detect.
    .PARAMETER BlockAccess
        Whether to block access to matched content.
    .PARAMETER NotifyUser
        An array of user addresses to notify when the rule is matched.
    .PARAMETER GenerateAlert
        An array of user addresses to receive alerts when the rule is matched.
    .PARAMETER Comment
        An optional comment describing the rule.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        New-SLDlpRule -Name 'Block Credit Cards' -Policy 'PII Protection' -BlockAccess $true
    .EXAMPLE
        New-SLDlpRule -Name 'Detect SSN' -Policy 'PII Protection' -ContentContainsSensitiveInformation @(@{Name='U.S. Social Security Number (SSN)'; minCount=1}) -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Name,

        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Policy,

        [hashtable[]]$ContentContainsSensitiveInformation,

        [bool]$BlockAccess,

        [string[]]$NotifyUser,

        [string[]]$GenerateAlert,

        [string]$Comment,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'New-DlpComplianceRule' -Target $Name -Detail @{
                Policy                                = $Policy
                ContentContainsSensitiveInformation   = $ContentContainsSensitiveInformation
                BlockAccess                           = $BlockAccess
                NotifyUser                            = $NotifyUser
                GenerateAlert                         = $GenerateAlert
                Comment                               = $Comment
            } -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action                                = 'New-DlpComplianceRule'
                Name                                  = $Name
                Policy                                = $Policy
                ContentContainsSensitiveInformation   = $ContentContainsSensitiveInformation
                BlockAccess                           = $BlockAccess
                NotifyUser                            = $NotifyUser
                GenerateAlert                         = $GenerateAlert
                Comment                               = $Comment
                DryRun                                = $true
            }

            if ($AsJson) {
                return $dryRunResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }
            return $dryRunResult
        }

        if (-not $PSCmdlet.ShouldProcess($Name, 'Create DLP compliance rule')) {
            return
        }

        try {
            Write-Verbose "Creating DLP rule: $Name"

            $params = @{
                Name   = $Name
                Policy = $Policy
            }
            if ($null -ne $ContentContainsSensitiveInformation) { $params['ContentContainsSensitiveInformation'] = $ContentContainsSensitiveInformation }
            if ($PSBoundParameters.ContainsKey('BlockAccess'))  { $params['BlockAccess']                         = $BlockAccess }
            if ($NotifyUser)                                    { $params['NotifyUser']                           = $NotifyUser }
            if ($GenerateAlert)                                 { $params['GenerateAlert']                        = $GenerateAlert }
            if ($Comment)                                       { $params['Comment']                              = $Comment }

            $result = Invoke-SLComplianceCommand -OperationName "New-DlpComplianceRule '$Name'" -ScriptBlock {
                New-DlpComplianceRule @params
            }

            Write-SLAuditEntry -Action 'New-DlpComplianceRule' -Target $Name -Detail @{
                Policy                                = $Policy
                ContentContainsSensitiveInformation   = $ContentContainsSensitiveInformation
                BlockAccess                           = $BlockAccess
                NotifyUser                            = $NotifyUser
                GenerateAlert                         = $GenerateAlert
                Comment                               = $Comment
            } -Result 'success'

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'New-DlpComplianceRule' -Target $Name -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
