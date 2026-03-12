function Get-SLElevationStatus {
    <#
    .SYNOPSIS
        Gets the current elevation state from the local elevation-state.json file.
    .DESCRIPTION
        Reads the elevation-state.json file tracked by $script:SLConfig.ElevationState
        and returns the current elevation status. If the file does not exist,
        an empty state object is returned. This is a read-only local operation
        that does not require any service connections.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLElevationStatus
    .EXAMPLE
        Get-SLElevationStatus -AsJson
    #>
    [CmdletBinding()]
    param(
        [switch]$AsJson
    )

    process {
        try {
            $statePath = $script:SLConfig.ElevationState

            if (-not (Test-Path -Path $statePath)) {
                Write-Verbose "Elevation state file not found at '$statePath'. Returning empty state."

                $result = [PSCustomObject]@{
                    StatePath = $statePath
                    Exists    = $false
                    State     = [PSCustomObject]@{}
                }

                if ($AsJson) {
                    return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
                }
                return $result
            }

            Write-Verbose "Reading elevation state from '$statePath'."

            $stateContent = Get-Content -Path $statePath -Raw | ConvertFrom-Json

            $result = [PSCustomObject]@{
                StatePath = $statePath
                Exists    = $true
                State     = $stateContent
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
