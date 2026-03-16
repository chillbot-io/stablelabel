function Get-SLTemplate {
    <#
    .SYNOPSIS
        Lists available pre-built compliance templates bundled with the module.
    .DESCRIPTION
        Returns the built-in compliance templates that can be deployed via
        Deploy-SLTemplate. Templates cover common scenarios such as sensitivity
        labels, DLP policies, retention labels, and HIPAA compliance rules.
        No connection is required as templates are defined locally within the module.
    .PARAMETER Name
        Filter templates by name (exact match). If no template matches the
        specified name, a warning is written.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLTemplate
    .EXAMPLE
        Get-SLTemplate -Name 'GDPR-DLP'
    .EXAMPLE
        Get-SLTemplate -AsJson
    #>
    [CmdletBinding()]
    param(
        [ValidateNotNullOrEmpty()]
        [string]$Name,

        [switch]$AsJson
    )

    process {
        $templates = @(
            [PSCustomObject]@{
                Name        = 'Standard-Labels'
                Description = 'Basic sensitivity label hierarchy: Public, Internal, Confidential, Highly Confidential with sublabels'
                Type        = 'Labels'
                Labels      = @(
                    'Public',
                    'Internal',
                    'Confidential',
                    'Confidential\All Employees',
                    'Highly Confidential',
                    'Highly Confidential\All Employees'
                )
            },
            [PSCustomObject]@{
                Name               = 'GDPR-DLP'
                Description        = 'EU personal data protection rules covering national IDs, passports, and tax identifiers'
                Type               = 'DLP'
                SensitiveInfoTypes = @(
                    'EU National Identification Number',
                    'EU Passport Number',
                    'EU Tax Identification Number'
                )
            },
            [PSCustomObject]@{
                Name               = 'Healthcare-HIPAA'
                Description        = 'HIPAA compliance rules detecting protected health information in documents and emails'
                Type               = 'DLP'
                SensitiveInfoTypes = @(
                    'U.S. Social Security Number',
                    'Drug Enforcement Agency Number',
                    'U.S. Health Insurance Claim Number'
                )
            },
            [PSCustomObject]@{
                Name               = 'PCI-DSS'
                Description        = 'PCI-DSS rules detecting credit card numbers, bank accounts, and routing numbers'
                Type               = 'DLP'
                SensitiveInfoTypes = @(
                    'Credit Card Number',
                    'U.S. Bank Account Number',
                    'ABA Routing Number'
                )
            },
            [PSCustomObject]@{
                Name               = 'PII-Protection'
                Description        = 'Detect and protect personal identifiers including SSNs, driver licenses, and passport numbers'
                Type               = 'DLP'
                SensitiveInfoTypes = @(
                    'U.S. Social Security Number',
                    'U.S. Driver''s License Number',
                    'U.S. Passport Number'
                )
            }
        )

        if ($Name) {
            $result = $templates | Where-Object { $_.Name -eq $Name }
            if (-not $result) {
                Write-Warning "No template found with name '$Name'."
                return
            }
        }
        else {
            $result = $templates
        }

        if ($AsJson) {
            return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
        }

        return $result
    }
}
