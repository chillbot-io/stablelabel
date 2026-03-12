function Deploy-SLTemplate {
    <#
    .SYNOPSIS
        Deploys a named compliance template by creating the corresponding labels, policies, or rules.
    .DESCRIPTION
        Retrieves a built-in template by name via Get-SLTemplate and deploys its
        contents. Depending on the template type:
          - Labels: creates a label policy referencing the template label names.
          - DLP: creates a DLP policy and a DLP rule per sensitive information type.
          - Retention: creates a retention label for each label definition.
        The DryRun switch is passed through to the underlying SL commands.
    .PARAMETER Name
        The name of the template to deploy. Must match a built-in template name.
    .PARAMETER DryRun
        Simulate the deployment without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Deploy-SLTemplate -Name 'Standard-Labels'
    .EXAMPLE
        Deploy-SLTemplate -Name 'GDPR-DLP' -DryRun
    .EXAMPLE
        Deploy-SLTemplate -Name 'Financial-Retention' -AsJson
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Name,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        $template = Get-SLTemplate -Name $Name
        if (-not $template) {
            return
        }

        if (-not $PSCmdlet.ShouldProcess($Name, "Deploy compliance template '$($template.Type)'")) {
            return
        }

        try {
            Write-Verbose "Deploying template '$Name' (Type: $($template.Type))"

            $results = @()
            $itemsCreated = 0

            switch ($template.Type) {
                'Labels' {
                    Write-Verbose "Creating label policy '$Name' with labels: $($template.Labels -join ', ')"
                    $policyResult = New-SLLabelPolicy -Name "$Name-Policy" -Labels $template.Labels -DryRun:$isDryRun
                    $results += $policyResult
                    $itemsCreated++
                }
                'DLP' {
                    Write-Verbose "Creating DLP policy '$Name' with sensitive info types"
                    $policyResult = New-SLDlpPolicy -Name "$Name-Policy" -ExchangeLocation 'All' -SharePointLocation 'All' -OneDriveLocation 'All' -DryRun:$isDryRun
                    $results += $policyResult
                    $itemsCreated++

                    foreach ($infoType in $template.SensitiveInfoTypes) {
                        Write-Verbose "Creating DLP rule for sensitive info type: $infoType"
                        $ruleName = "$Name-$($infoType -replace '\s+', '-')"
                        $ruleResult = New-SLDlpRule -Name $ruleName -Policy "$Name-Policy" `
                            -ContentContainsSensitiveInformation @(@{ Name = $infoType; minCount = 1 }) `
                            -DryRun:$isDryRun
                        $results += $ruleResult
                        $itemsCreated++
                    }
                }
                'Retention' {
                    foreach ($labelDef in $template.Labels) {
                        Write-Verbose "Creating retention label: $($labelDef.Name)"
                        $labelResult = New-SLRetentionLabel -Name $labelDef.Name `
                            -RetentionDuration $labelDef.Duration `
                            -RetentionAction $labelDef.Action `
                            -DryRun:$isDryRun
                        $results += $labelResult
                        $itemsCreated++
                    }
                }
            }

            $auditResult = if ($isDryRun) { 'dry-run' } else { 'success' }
            Write-SLAuditEntry -Action 'Deploy-SLTemplate' -Target $Name -Detail @{
                Type         = $template.Type
                ItemsCreated = $itemsCreated
            } -Result $auditResult

            $summary = [PSCustomObject]@{
                TemplateName = $Name
                Type         = $template.Type
                ItemsCreated = $itemsCreated
                Results      = $results
            }

            if ($AsJson) {
                return $summary | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $summary
        }
        catch {
            Write-SLAuditEntry -Action 'Deploy-SLTemplate' -Target $Name -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
