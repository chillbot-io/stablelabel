function Disconnect-SLProtection {
    <#
    .SYNOPSIS
        Disconnects from the Azure Information Protection service and clears state.
    .DESCRIPTION
        Wraps Disconnect-AipService and resets the Protection-related entries
        in the module-scoped connection hashtable.
    .PARAMETER AsJson
        Return the disconnection result as a JSON string instead of a PSCustomObject.
    .EXAMPLE
        Disconnect-SLProtection
    #>
    [CmdletBinding()]
    param(
        [Parameter()]
        [switch]$AsJson
    )

    process {
        try {
            Write-Verbose "Disconnecting from Azure Information Protection service."

            Disconnect-AipService -ErrorAction Stop

            $script:SLConnection['ProtectionConnected']       = $false
            $script:SLConnection['ConnectedAt']['Protection'] = $null

            $result = [PSCustomObject]@{
                Status  = 'Disconnected'
                Backend = 'Protection'
            }

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth 20
            }

            return $result
        }
        catch {
            throw "Failed to disconnect from AIP Service: $_"
        }
    }
}
