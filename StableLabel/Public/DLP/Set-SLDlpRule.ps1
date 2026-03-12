function Set-SLDlpRule {
    <#
    .SYNOPSIS
        Modifies an existing DLP compliance rule in Security & Compliance Center.
    .DESCRIPTION
        Wraps the Set-DlpComplianceRule cmdlet via Invoke-SLComplianceCommand.
        Updates a DLP rule with the specified settings.
    .PARAMETER Identity
        The name or GUID of the DLP rule to modify.
    .PARAMETER ContentContainsSensitiveInformation
        An array of hashtables defining sensitive information types to detect.
    .PARAMETER BlockAccess
        Whether to block access to matched content.
    .PARAMETER NotifyUser
        An array of user addresses to notify when the rule is matched.
    .PARAMETER GenerateAlert
        An array of user addresses to receive alerts when the rule is matched.
    .PARAMETER Comment
        An updated comment for the rule.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Set-SLDlpRule -Identity 'Block Credit Cards' -BlockAccess $true
    .EXAMPLE
        Set-SLDlpRule -Identity 'Detect SSN' -NotifyUser 'admin@contoso.com' -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [ValidateNotNullOrEmpty()]
        [string]$Identity,

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

        $detail = @{
            ContentContainsSensitiveInformation = $ContentContainsSensitiveInformation
            BlockAccess                         = $BlockAccess
            NotifyUser                          = $NotifyUser
            GenerateAlert                       = $GenerateAlert
            Comment                             = $Comment
        }

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'Set-DlpComplianceRule' -Target $Identity -Detail $detail -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action                              = 'Set-DlpComplianceRule'
                Identity                            = $Identity
                ContentContainsSensitiveInformation = $ContentContainsSensitiveInformation
                BlockAccess                         = $BlockAccess
                NotifyUser                          = $NotifyUser
                GenerateAlert                       = $GenerateAlert
                Comment                             = $Comment
                DryRun                              = $true
            }

            if ($AsJson) {
                return $dryRunResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }
            return $dryRunResult
        }

        if (-not $PSCmdlet.ShouldProcess($Identity, 'Modify DLP compliance rule')) {
            return
        }

        try {
            Write-Verbose "Updating DLP rule: $Identity"

            $params = @{ Identity = $Identity }
            if ($null -ne $ContentContainsSensitiveInformation) { $params['ContentContainsSensitiveInformation'] = $ContentContainsSensitiveInformation }
            if ($PSBoundParameters.ContainsKey('BlockAccess'))  { $params['BlockAccess']                         = $BlockAccess }
            if ($NotifyUser)                                    { $params['NotifyUser']                           = $NotifyUser }
            if ($GenerateAlert)                                 { $params['GenerateAlert']                        = $GenerateAlert }
            if ($Comment)                                       { $params['Comment']                              = $Comment }

            $result = Invoke-SLComplianceCommand -OperationName "Set-DlpComplianceRule '$Identity'" -ScriptBlock {
                Set-DlpComplianceRule @params
            }

            Write-SLAuditEntry -Action 'Set-DlpComplianceRule' -Target $Identity -Detail $detail -Result 'success'

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'Set-DlpComplianceRule' -Target $Identity -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
