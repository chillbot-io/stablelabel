function Get-SLSensitiveInfoType {
    <#
    .SYNOPSIS
        Lists available Sensitive Information Types from the tenant.
    .DESCRIPTION
        Wraps Get-DlpSensitiveInformationType to discover all SITs available
        for use in auto-labeling rules. Results include built-in Microsoft SITs
        and any custom SITs defined in the tenant.
    .PARAMETER Identity
        Name or GUID of a specific SIT to retrieve.
    .PARAMETER Search
        Filter SITs by name (client-side wildcard match).
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLSensitiveInfoType
    .EXAMPLE
        Get-SLSensitiveInfoType -Search 'Credit Card'
    .EXAMPLE
        Get-SLSensitiveInfoType -Identity 'U.S. Social Security Number (SSN)'
    #>
    [CmdletBinding()]
    param(
        [Parameter(ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [ValidateNotNullOrEmpty()]
        [string]$Identity,

        [string]$Search,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        try {
            if ($Identity) {
                Write-Verbose "Retrieving SIT: $Identity"
                $result = Invoke-SLComplianceCommand -OperationName "Get-DlpSensitiveInformationType '$Identity'" -ScriptBlock {
                    Get-DlpSensitiveInformationType -Identity $Identity
                }.GetNewClosure()
            }
            else {
                Write-Verbose 'Retrieving all Sensitive Information Types.'
                $result = Invoke-SLComplianceCommand -OperationName 'Get-DlpSensitiveInformationType (all)' -ScriptBlock {
                    Get-DlpSensitiveInformationType
                }
            }

            # Normalize output to consistent shape
            $sits = @($result) | ForEach-Object {
                [PSCustomObject]@{
                    Name            = $_.Name
                    Id              = if ($_.Id) { $_.Id.ToString() } else { $null }
                    Description     = $_.Description
                    Publisher       = $_.Publisher
                    Type            = if ($_.Type) { $_.Type } else { 'BuiltIn' }
                    RecommendedConfidence = if ($_.RecommendedConfidence) { $_.RecommendedConfidence } else { $null }
                }
            }

            # Client-side search filter
            if ($Search) {
                $pattern = "*$Search*"
                $sits = $sits | Where-Object { $_.Name -like $pattern -or $_.Description -like $pattern }
            }

            if ($AsJson) {
                return $sits | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $sits
        }
        catch {
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
