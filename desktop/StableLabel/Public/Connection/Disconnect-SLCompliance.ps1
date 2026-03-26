function Disconnect-SLCompliance {
    <#
    .SYNOPSIS
        Disconnects from the Security & Compliance session and clears state.
    .DESCRIPTION
        Wraps Disconnect-ExchangeOnline (which tears down the implicit remoting
        session used by Connect-IPPSSession) and resets Compliance-related
        entries in the module-scoped connection hashtable.
    .PARAMETER AsJson
        Return the disconnection result as a JSON string instead of a PSCustomObject.
    .EXAMPLE
        Disconnect-SLCompliance
    #>
    [CmdletBinding()]
    param(
        [Parameter()]
        [switch]$AsJson
    )

    process {
        try {
            Write-Verbose "Disconnecting from Security & Compliance."

            Disconnect-ExchangeOnline -Confirm:$false -ErrorAction Stop

            $script:SLConnection['ComplianceConnected']        = $false
            $script:SLConnection['ConnectedAt']['Compliance']  = $null
            $script:SLConnection['ComplianceCommandCount']     = 0
            $script:SLConnection['ComplianceSessionStart']     = $null

            $result = [PSCustomObject]@{
                Status  = 'Disconnected'
                Backend = 'Compliance'
            }

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth 20
            }

            return $result
        }
        catch {
            throw "Failed to disconnect from Security & Compliance: $_"
        }
    }
}
