function Get-SLDocumentTrack {
    <#
    .SYNOPSIS
        Gets document tracking log entries from Azure Information Protection.
    .DESCRIPTION
        Wraps Get-AipServiceDocumentLog via Invoke-SLProtectionCommand.
        Retrieves document tracking information, optionally filtered by user email
        and time range. This is a Windows-only function requiring the AIPService module.
    .PARAMETER UserEmail
        Filter results by the specified user email address.
    .PARAMETER FromTime
        The start of the time range to query.
    .PARAMETER ToTime
        The end of the time range to query.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLDocumentTrack
    .EXAMPLE
        Get-SLDocumentTrack -UserEmail 'user@contoso.com'
    .EXAMPLE
        Get-SLDocumentTrack -FromTime (Get-Date).AddDays(-7) -ToTime (Get-Date) -AsJson
    #>
    [CmdletBinding()]
    param(
        [string]$UserEmail,

        [datetime]$FromTime,

        [datetime]$ToTime,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Protection
    }

    process {
        try {
            Write-Verbose 'Retrieving document tracking log entries.'

            $params = @{}
            if ($PSBoundParameters.ContainsKey('UserEmail')) { $params['UserEmail'] = $UserEmail }
            if ($PSBoundParameters.ContainsKey('FromTime'))  { $params['FromTime']  = $FromTime }
            if ($PSBoundParameters.ContainsKey('ToTime'))    { $params['ToTime']    = $ToTime }

            $result = Invoke-SLProtectionCommand -OperationName 'Get-AipServiceDocumentLog' -ScriptBlock {
                Get-AipServiceDocumentLog @params
            }

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
