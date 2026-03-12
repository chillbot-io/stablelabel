function Import-SLProtectionTemplate {
    <#
    .SYNOPSIS
        Imports an Azure Information Protection template from an XML file.
    .DESCRIPTION
        Wraps Import-AipServiceTemplate via Invoke-SLProtectionCommand.
        Imports a protection template from the specified XML file path.
        Validates that the file exists before attempting the import.
        This is a Windows-only function requiring the AIPService module.
    .PARAMETER Path
        The input file path of the template XML to import.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Import-SLProtectionTemplate -Path 'C:\Templates\template.xml'
    .EXAMPLE
        Import-SLProtectionTemplate -Path 'C:\Templates\template.xml' -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Path,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Protection
    }

    process {
        if (-not (Test-Path -Path $Path)) {
            throw "Template file not found: '$Path'. Verify the file exists and try again."
        }

        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'Import-AipServiceTemplate' -Target $Path -Detail @{
                Path = $Path
            } -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action = 'Import-AipServiceTemplate'
                Path   = $Path
                DryRun = $true
            }

            if ($AsJson) {
                return $dryRunResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }
            return $dryRunResult
        }

        if (-not $PSCmdlet.ShouldProcess($Path, 'Import protection template')) {
            return
        }

        try {
            Write-Verbose "Importing protection template from '$Path'."

            $result = Invoke-SLProtectionCommand -OperationName "Import-AipServiceTemplate '$Path'" -ScriptBlock {
                Import-AipServiceTemplate -Path $Path
            }

            Write-SLAuditEntry -Action 'Import-AipServiceTemplate' -Target $Path -Detail @{
                Path = $Path
            } -Result 'success'

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'Import-AipServiceTemplate' -Target $Path -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
