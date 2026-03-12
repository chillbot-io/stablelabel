function Test-SLFileTypeSupported {
    <#
    .SYNOPSIS
        Checks if a file extension supports sensitivity label assignment via Graph API.
    .DESCRIPTION
        The assignSensitivityLabel API only works on modern Office formats and PDF.
        Older formats (.doc, .xls) and other file types silently fail.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$FileName
    )

    $supportedExtensions = @(
        '.docx', '.docm', '.dotx', '.dotm',
        '.xlsx', '.xlsm', '.xltx', '.xltm', '.xlsb',
        '.pptx', '.pptm', '.potx', '.potm', '.ppsx', '.ppsm',
        '.pdf',
        '.vsdx', '.vsdm', '.vstx', '.vstm', '.vssx', '.vssm'
    )

    $extension = [System.IO.Path]::GetExtension($FileName).ToLower()

    if (-not $extension) {
        return [PSCustomObject]@{
            FileName  = $FileName
            Extension = ''
            Supported = $false
            Reason    = 'No file extension detected'
        }
    }

    $supported = $extension -in $supportedExtensions

    [PSCustomObject]@{
        FileName  = $FileName
        Extension = $extension
        Supported = $supported
        Reason    = if ($supported) { 'Supported format' } else { "Unsupported format '$extension'. Only modern Office formats (.docx, .xlsx, .pptx, etc.) and PDF are supported." }
    }
}
