function Export-SLProtectionTemplate {
    <#
    .SYNOPSIS
        Exports an Azure Information Protection template to an XML file.
    .DESCRIPTION
        Wraps Export-AipServiceTemplate via Invoke-SLProtectionCommand.
        Exports the specified protection template to an XML file at the given path.
        This is a Windows-only function requiring the AIPService module.
    .PARAMETER TemplateId
        The GUID of the template to export.
    .PARAMETER Path
        The output file path where the template XML will be saved.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Export-SLProtectionTemplate -TemplateId '00000000-0000-0000-0000-000000000001' -Path 'C:\Templates\template.xml'
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$TemplateId,

        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Path,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Protection
    }

    process {
        if (-not $PSCmdlet.ShouldProcess($TemplateId, "Export protection template to '$Path'")) {
            return
        }

        try {
            Write-Verbose "Exporting protection template '$TemplateId' to '$Path'."

            $result = Invoke-SLProtectionCommand -OperationName "Export-AipServiceTemplate '$TemplateId'" -ScriptBlock {
                Export-AipServiceTemplate -TemplateId $TemplateId -Path $Path
            }

            Write-SLAuditEntry -Action 'Export-AipServiceTemplate' -Target $TemplateId -Detail @{
                Path = $Path
            } -Result 'success'

            $output = [PSCustomObject]@{
                Action     = 'Export-AipServiceTemplate'
                TemplateId = $TemplateId
                Path       = $Path
            }

            if ($AsJson) {
                return $output | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $output
        }
        catch {
            Write-SLAuditEntry -Action 'Export-AipServiceTemplate' -Target $TemplateId -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
