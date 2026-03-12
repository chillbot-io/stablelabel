function Get-SLFileShareLabel {
    <#
    .SYNOPSIS
        Gets the sensitivity label status of files on a CIFS/SMB share.
    .DESCRIPTION
        Uses the AIP unified labeling client to retrieve the current sensitivity
        label information for one or more files on a CIFS/SMB file share. Supports
        both single file and directory scans with optional recursion and filtering.
    .PARAMETER Path
        File path or directory path (UNC or mapped drive).
    .PARAMETER Recurse
        If Path is a directory, recurse into subdirectories.
    .PARAMETER Filter
        File filter pattern (e.g., '*.docx'). Default: '*'.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLFileShareLabel -Path '\\server\share\document.docx'
    .EXAMPLE
        Get-SLFileShareLabel -Path '\\server\share\Finance' -Recurse -Filter '*.xlsx'
    .EXAMPLE
        Get-SLFileShareLabel -Path 'Z:\Reports' -Recurse -AsJson
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Path,

        [switch]$Recurse,

        [string]$Filter = '*',

        [switch]$AsJson
    )

    begin {
        Assert-SLAipClient
    }

    process {
        $target = $Path

        try {
            Write-Verbose "Getting sensitivity label status for '$Path'."

            if (Test-Path -Path $Path -PathType Leaf) {
                # Single file
                $result = Get-AIPFileStatus -Path $Path

                Write-SLAuditEntry -Action 'Get-FileShareLabel' -Target $target -Detail @{
                    Path    = $Path
                    IsFile  = $true
                } -Result 'success'
            }
            else {
                # Directory - enumerate files then get status
                Write-Verbose "Enumerating files in directory '$Path' (Recurse: $Recurse, Filter: $Filter)."

                $files = Get-ChildItem -Path $Path -File -Recurse:$Recurse -Filter $Filter

                if (-not $files) {
                    Write-Warning "No files found matching filter '$Filter' in '$Path'."
                    return
                }

                $result = $files | Get-AIPFileStatus

                Write-SLAuditEntry -Action 'Get-FileShareLabel' -Target $target -Detail @{
                    Path      = $Path
                    IsFile    = $false
                    Recurse   = [bool]$Recurse
                    Filter    = $Filter
                    FileCount = @($files).Count
                } -Result 'success'
            }

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'Get-FileShareLabel' -Target $target -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
