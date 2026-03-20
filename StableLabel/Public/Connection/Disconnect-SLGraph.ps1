function Disconnect-SLGraph {
    <#
    .SYNOPSIS
        Disconnects from Microsoft Graph and clears Graph connection state.
    .DESCRIPTION
        Wraps Disconnect-MgGraph and resets the Graph-related entries in the
        module-scoped connection hashtable.
    .PARAMETER AsJson
        Return the disconnection result as a JSON string instead of a PSCustomObject.
    .EXAMPLE
        Disconnect-SLGraph
    #>
    [CmdletBinding()]
    param(
        [Parameter()]
        [switch]$AsJson
    )

    process {
        try {
            Write-Verbose "Disconnecting from Microsoft Graph."

            Disconnect-MgGraph -ErrorAction Stop

            $script:SLConnection['GraphConnected']       = $false
            $script:SLConnection['ConnectedAt']['Graph'] = $null
            # Note: UPN and TenantId are not cleared here because they may
            # have been set by the Compliance connection independently.

            $result = [PSCustomObject]@{
                Status  = 'Disconnected'
                Backend = 'Graph'
            }

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth 20
            }

            return $result
        }
        catch {
            throw "Failed to disconnect from Microsoft Graph: $_"
        }
    }
}
