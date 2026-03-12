function Disconnect-SLFileShare {
    <#
    .SYNOPSIS
        Unmounts a previously connected CIFS/SMB file share.
    .DESCRIPTION
        Removes the PSDrive for one or more tracked file shares and clears
        them from the module-scoped $script:SLFileShares tracking list.
        Shares can be identified by UNC path, friendly name, or the -All
        switch can be used to disconnect every tracked share.
    .PARAMETER Path
        UNC path of the share to disconnect.
    .PARAMETER Name
        Friendly name of the share to disconnect.
    .PARAMETER All
        Disconnect all tracked file shares.
    .PARAMETER AsJson
        Return the result as a JSON string instead of a PSCustomObject.
    .EXAMPLE
        Disconnect-SLFileShare -Path '\\server\share'
    .EXAMPLE
        Disconnect-SLFileShare -Name 'DataShare'
    .EXAMPLE
        Disconnect-SLFileShare -All
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(ParameterSetName = 'ByPath')]
        [ValidateNotNullOrEmpty()]
        [string]$Path,

        [Parameter(ParameterSetName = 'ByName')]
        [ValidateNotNullOrEmpty()]
        [string]$Name,

        [Parameter(ParameterSetName = 'All')]
        [switch]$All,

        [Parameter()]
        [switch]$AsJson
    )

    process {
        # Validate that at least one identifier is specified
        if (-not $Path -and -not $Name -and -not $All) {
            throw "You must specify at least one of -Path, -Name, or -All."
        }

        if (-not $script:SLFileShares -or $script:SLFileShares.Count -eq 0) {
            throw "No tracked file shares to disconnect."
        }

        # Determine which shares to disconnect
        if ($All) {
            $sharesToRemove = @($script:SLFileShares)
        }
        elseif ($Path) {
            $sharesToRemove = @($script:SLFileShares | Where-Object { $_.Path -eq $Path })
            if ($sharesToRemove.Count -eq 0) {
                throw "No tracked file share found with path '$Path'."
            }
        }
        else {
            $sharesToRemove = @($script:SLFileShares | Where-Object { $_.Name -eq $Name })
            if ($sharesToRemove.Count -eq 0) {
                throw "No tracked file share found with name '$Name'."
            }
        }

        $results  = [System.Collections.Generic.List[PSCustomObject]]::new()
        $errors   = [System.Collections.Generic.List[string]]::new()

        foreach ($share in $sharesToRemove) {
            $target = $share.Path

            if (-not $PSCmdlet.ShouldProcess($target, 'Unmount file share')) {
                continue
            }

            try {
                Write-Verbose "Disconnecting file share '$($share.Name)' ($target)."

                Remove-PSDrive -Name $share.DriveName -Force -ErrorAction Stop

                # Remove from tracking list
                $script:SLFileShares.Remove($share) | Out-Null

                Write-SLAuditEntry -Action 'Disconnect-FileShare' -Target $target -Detail @{
                    Name      = $share.Name
                    DriveName = $share.DriveName
                } -Result 'success'

                $results.Add([PSCustomObject]@{
                    Name   = $share.Name
                    Path   = $target
                    Status = 'Disconnected'
                })
            }
            catch {
                Write-SLAuditEntry -Action 'Disconnect-FileShare' -Target $target -Result 'failed' -ErrorMessage $_.Exception.Message
                $errors.Add("Failed to disconnect '$target': $($_.Exception.Message)")

                $results.Add([PSCustomObject]@{
                    Name   = $share.Name
                    Path   = $target
                    Status = 'Failed'
                    Error  = $_.Exception.Message
                })

                # When disconnecting a single share, throw immediately
                if (-not $All) {
                    $PSCmdlet.ThrowTerminatingError($_)
                }
            }
        }

        $summary = [PSCustomObject]@{
            Action         = 'Disconnect-FileShare'
            Disconnected   = @($results | Where-Object Status -eq 'Disconnected').Count
            Failed         = @($results | Where-Object Status -eq 'Failed').Count
            Results        = $results
            Errors         = if ($errors.Count -gt 0) { $errors } else { $null }
        }

        if ($AsJson) {
            return $summary | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
        }

        return $summary
    }
}
