function New-SLAutoLabelRule {
    <#
    .SYNOPSIS
        Creates a new auto-labeling rule under an existing auto-label policy.
    .DESCRIPTION
        Wraps New-AutoSensitivityLabelRule. Rules define the conditions
        (SIT matches, document size, file extensions, etc.) that trigger
        automatic application of the parent policy's sensitivity label.

        Conditions can include:
        - Sensitive Information Type matches (SITs) with count and confidence
        - Document size thresholds
        - File extension filters
    .PARAMETER Name
        The name of the new rule.
    .PARAMETER Policy
        The parent auto-label policy name this rule belongs to.
    .PARAMETER ContentContainsSensitiveInformation
        JSON string defining SIT conditions. Each entry:
        { "Name": "SIT Name", "MinCount": 1, "MaxCount": -1, "MinConfidence": 75, "MaxConfidence": 100 }
        Wrap multiple in a JSON array for AND logic.
    .PARAMETER DocumentSizeOver
        Minimum document size in bytes to match (e.g., 1048576 for 1MB).
    .PARAMETER ContentExtensionMatchesWords
        File extensions to match (e.g., 'docx', 'pdf', 'xlsx').
    .PARAMETER Comment
        Optional description.
    .PARAMETER Disabled
        Create the rule in a disabled state.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        $sits = '[{"Name":"Credit Card Number","MinCount":1,"MinConfidence":85,"MaxConfidence":100,"MaxCount":-1}]'
        New-SLAutoLabelRule -Name 'CC Detection' -Policy 'Finance Auto-Label' -ContentContainsSensitiveInformation $sits
    .EXAMPLE
        New-SLAutoLabelRule -Name 'Large Docs' -Policy 'Size Policy' -DocumentSizeOver 10485760
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Name,

        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Policy,

        [string]$ContentContainsSensitiveInformation,

        [long]$DocumentSizeOver,

        [string[]]$ContentExtensionMatchesWords,

        [string]$Comment,

        [switch]$Disabled,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        $detail = @{
            Policy                                = $Policy
            ContentContainsSensitiveInformation   = $ContentContainsSensitiveInformation
            DocumentSizeOver                      = $DocumentSizeOver
            ContentExtensionMatchesWords          = $ContentExtensionMatchesWords
        }

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'New-AutoSensitivityLabelRule' -Target $Name -Detail $detail -Result 'dry-run'
            $dryRunResult = [PSCustomObject]@{
                Action                              = 'New-AutoSensitivityLabelRule'
                Name                                = $Name
                Policy                              = $Policy
                ContentContainsSensitiveInformation = $ContentContainsSensitiveInformation
                DocumentSizeOver                    = $DocumentSizeOver
                ContentExtensionMatchesWords        = $ContentExtensionMatchesWords
                Disabled                            = [bool]$Disabled
                DryRun                              = $true
            }
            if ($AsJson) {
                return $dryRunResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }
            return $dryRunResult
        }

        if (-not $PSCmdlet.ShouldProcess($Name, 'Create auto-labeling rule')) {
            return
        }

        try {
            Write-Verbose "Creating auto-labeling rule: $Name for policy: $Policy"

            $params = @{
                Name   = $Name
                Policy = $Policy
            }

            if ($ContentContainsSensitiveInformation) {
                # Parse the JSON string into hashtable array for the cmdlet
                $sitConditions = $ContentContainsSensitiveInformation | ConvertFrom-Json
                # Build the condition hashtable array expected by the cmdlet
                $conditionArray = @()
                foreach ($sit in @($sitConditions)) {
                    $condition = @{
                        Name          = $sit.Name
                        minCount      = if ($sit.MinCount) { $sit.MinCount } else { 1 }
                        maxCount      = if ($sit.MaxCount) { $sit.MaxCount } else { -1 }
                        minConfidence = if ($sit.MinConfidence) { $sit.MinConfidence } else { 75 }
                        maxConfidence = if ($sit.MaxConfidence) { $sit.MaxConfidence } else { 100 }
                    }
                    $conditionArray += $condition
                }
                $params['ContentContainsSensitiveInformation'] = $conditionArray
            }

            if ($DocumentSizeOver -gt 0) {
                $params['DocumentSizeOver'] = $DocumentSizeOver
            }

            if ($ContentExtensionMatchesWords) {
                $params['ContentExtensionMatchesWords'] = $ContentExtensionMatchesWords
            }

            if ($Comment) {
                $params['Comment'] = $Comment
            }

            if ($Disabled) {
                $params['Disabled'] = $true
            }

            $result = Invoke-SLComplianceCommand -OperationName "New-AutoSensitivityLabelRule '$Name'" -ScriptBlock {
                New-AutoSensitivityLabelRule @params
            }

            Write-SLAuditEntry -Action 'New-AutoSensitivityLabelRule' -Target $Name -Detail $detail -Result 'success'

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'New-AutoSensitivityLabelRule' -Target $Name -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
