function Get-SLSitPatterns {
    <#
    .SYNOPSIS
        Returns built-in regex patterns for common Microsoft Sensitive Information Types.
    .DESCRIPTION
        Provides local pattern definitions that approximate the detection logic of
        common Microsoft SITs. These are used by Invoke-SLAutoLabelScan to detect
        sensitive content in files downloaded via Graph API.

        Each pattern includes:
        - Name: Matches the Microsoft SIT name for easy rule authoring
        - Patterns: One or more regex patterns
        - Validator: Optional scriptblock for checksum/format validation
        - Confidence: Base confidence level (Low/Medium/High)

        Note: This is a best-effort approximation. Microsoft's SIT engine uses
        additional context, proximity rules, and ML models that we cannot replicate.
    #>
    [CmdletBinding()]
    param()

    # Luhn checksum validator for credit cards
    $luhnValidator = {
        param([string]$Value)
        $digits = ($Value -replace '[^0-9]', '').ToCharArray() | ForEach-Object { [int]::Parse($_) }
        if ($digits.Count -lt 13) { return $false }
        $sum = 0
        $alt = $false
        for ($i = $digits.Count - 1; $i -ge 0; $i--) {
            $d = $digits[$i]
            if ($alt) {
                $d *= 2
                if ($d -gt 9) { $d -= 9 }
            }
            $sum += $d
            $alt = -not $alt
        }
        return ($sum % 10 -eq 0)
    }

    # SSN area/group/serial validator
    $ssnValidator = {
        param([string]$Value)
        $clean = $Value -replace '[^0-9]', ''
        if ($clean.Length -ne 9) { return $false }
        $area = [int]$clean.Substring(0, 3)
        $group = [int]$clean.Substring(3, 2)
        $serial = [int]$clean.Substring(5, 4)
        if ($area -eq 0 -or $area -eq 666 -or $area -ge 900) { return $false }
        if ($group -eq 0 -or $serial -eq 0) { return $false }
        return $true
    }

    @(
        # ── Financial ──────────────────────────────────────────────────
        @{
            Name       = 'Credit Card Number'
            Category   = 'Financial'
            Confidence = 'High'
            Patterns   = @(
                '(?<!\d)4[0-9]{3}[\s\-]?[0-9]{4}[\s\-]?[0-9]{4}[\s\-]?[0-9]{4}(?!\d)'        # Visa
                '(?<!\d)5[1-5][0-9]{2}[\s\-]?[0-9]{4}[\s\-]?[0-9]{4}[\s\-]?[0-9]{4}(?!\d)'    # Mastercard
                '(?<!\d)3[47][0-9]{2}[\s\-]?[0-9]{6}[\s\-]?[0-9]{5}(?!\d)'                      # Amex
                '(?<!\d)6(?:011|5[0-9]{2})[\s\-]?[0-9]{4}[\s\-]?[0-9]{4}[\s\-]?[0-9]{4}(?!\d)' # Discover
            )
            Validator  = $luhnValidator
        }

        @{
            Name       = 'International Banking Account Number (IBAN)'
            Category   = 'Financial'
            Confidence = 'High'
            Patterns   = @(
                '\b[A-Z]{2}[0-9]{2}[\s\-]?[A-Z0-9]{4}[\s\-]?(?:[A-Z0-9]{4}[\s\-]?){1,7}[A-Z0-9]{1,4}\b'
            )
        }

        @{
            Name       = 'SWIFT Code'
            Category   = 'Financial'
            Confidence = 'Medium'
            Patterns   = @(
                '\b[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b'
            )
        }

        # ── US Government IDs ─────────────────────────────────────────
        @{
            Name       = 'U.S. Social Security Number (SSN)'
            Category   = 'Government ID'
            Confidence = 'High'
            Patterns   = @(
                '(?<!\d)(?!000|666|9\d{2})\d{3}[\s\-](?!00)\d{2}[\s\-](?!0000)\d{4}(?!\d)'
            )
            Validator  = $ssnValidator
        }

        @{
            Name       = 'U.S. Individual Taxpayer Identification Number (ITIN)'
            Category   = 'Government ID'
            Confidence = 'High'
            Patterns   = @(
                '(?<!\d)9\d{2}[\s\-][7-9]\d[\s\-]\d{4}(?!\d)'
            )
        }

        @{
            Name       = 'U.S. / U.K. Passport Number'
            Category   = 'Government ID'
            Confidence = 'Medium'
            Patterns   = @(
                '(?i)(?:passport\s*(?:no|number|#)\s*[:=]?\s*)([A-Z]{1,2}[0-9]{6,9})'
            )
        }

        @{
            Name       = "U.S. Driver's License Number"
            Category   = 'Government ID'
            Confidence = 'Low'
            Patterns   = @(
                '(?i)(?:driver.?s?\s*lic(?:ense|ence)\s*(?:no|number|#)\s*[:=]?\s*)([A-Z0-9]{5,15})'
            )
        }

        # ── UK IDs ────────────────────────────────────────────────────
        @{
            Name       = 'U.K. National Insurance Number (NINO)'
            Category   = 'Government ID'
            Confidence = 'High'
            Patterns   = @(
                '(?i)\b(?!BG|GB|NK|KN|TN|NT|ZZ)[A-CEGHJ-PR-TW-Z]{2}[\s\-]?\d{2}[\s\-]?\d{2}[\s\-]?\d{2}[\s\-]?[A-D]\b'
            )
        }

        @{
            Name       = 'U.K. National Health Service Number'
            Category   = 'Health'
            Confidence = 'Medium'
            Patterns   = @(
                '(?<!\d)\d{3}[\s\-]?\d{3}[\s\-]?\d{4}(?!\d)'
            )
        }

        # ── Contact / PII ─────────────────────────────────────────────
        @{
            Name       = 'Email Address'
            Category   = 'PII'
            Confidence = 'High'
            Patterns   = @(
                '\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b'
            )
        }

        @{
            Name       = 'U.S. Phone Number'
            Category   = 'PII'
            Confidence = 'Medium'
            Patterns   = @(
                '(?<!\d)(?:\+?1[\s\-.]?)?\(?[2-9][0-9]{2}\)?[\s\-.]?[2-9][0-9]{2}[\s\-.]?[0-9]{4}(?!\d)'
            )
        }

        @{
            Name       = 'U.K. Phone Number'
            Category   = 'PII'
            Confidence = 'Medium'
            Patterns   = @(
                '(?<!\d)\+?44[\s\-.]?(?:0|\(0\))?[\s\-.]?[1-9][0-9]{2,4}[\s\-.]?[0-9]{3,4}[\s\-.]?[0-9]{3,4}(?!\d)'
            )
        }

        @{
            Name       = 'Physical Address'
            Category   = 'PII'
            Confidence = 'Low'
            Patterns   = @(
                '(?i)\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:St(?:reet)?|Ave(?:nue)?|Blvd|Dr(?:ive)?|Ln|Lane|Rd|Road|Ct|Court|Pl|Place|Way|Cir(?:cle)?)\b'
            )
        }

        @{
            Name       = 'Date of Birth'
            Category   = 'PII'
            Confidence = 'Medium'
            Patterns   = @(
                '(?i)(?:DOB|Date\s+of\s+Birth|Born|Birthday)\s*[:=]?\s*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})'
            )
        }

        # ── Health ────────────────────────────────────────────────────
        @{
            Name       = 'U.S. DEA Number'
            Category   = 'Health'
            Confidence = 'High'
            Patterns   = @(
                '\b[ABCDEFGHJKLMNPRSTUX][A-Z9][0-9]{7}\b'
            )
        }

        # ── Technical / Secrets ───────────────────────────────────────
        @{
            Name       = 'IP Address'
            Category   = 'Technical'
            Confidence = 'Medium'
            Patterns   = @(
                '\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b'
            )
        }

        @{
            Name       = 'Azure Storage Account Key'
            Category   = 'Credential'
            Confidence = 'High'
            Patterns   = @(
                '(?i)DefaultEndpointsProtocol=https?;AccountName=[^;]+;AccountKey=[A-Za-z0-9+/=]+'
            )
        }

        @{
            Name       = 'AWS Access Key'
            Category   = 'Credential'
            Confidence = 'High'
            Patterns   = @(
                '\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'
            )
        }

        @{
            Name       = 'Private Key (PEM)'
            Category   = 'Credential'
            Confidence = 'High'
            Patterns   = @(
                '-----BEGIN\s(?:RSA\s)?PRIVATE\sKEY-----'
            )
        }

        @{
            Name       = 'GitHub Personal Access Token'
            Category   = 'Credential'
            Confidence = 'High'
            Patterns   = @(
                '\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}\b'
            )
        }

        @{
            Name       = 'Generic API Key'
            Category   = 'Credential'
            Confidence = 'Low'
            Patterns   = @(
                '(?i)(?:api[_\-]?key|apikey|secret[_\-]?key)\s*[:=]\s*["\x27]?([A-Za-z0-9\-_]{20,})["\x27]?'
            )
        }
    )
}
