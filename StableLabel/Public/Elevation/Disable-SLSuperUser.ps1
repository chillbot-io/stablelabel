function Disable-SLSuperUser {
    <#
    .SYNOPSIS
        Disables the AIP Service super user feature for the tenant.
    .DESCRIPTION
        Wraps Disable-AipServiceSuperUserFeature via Invoke-SLProtectionCommand.
        This is a Windows-only operation that requires the AIPService module.
        After disabling, the elevation state is updated in the local
        elevation-state.json file.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Disable-SLSuperUser
    .EXAMPLE
        Disable-SLSuperUser -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Protection
    }

    process {
        $target = 'AipServiceSuperUserFeature'
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'Disable-SuperUser' -Target $target -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action = 'Disable-SuperUser'
                Target = $target
                DryRun = $true
            }

            if ($AsJson) {
                return $dryRunResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }
            return $dryRunResult
        }

        if (-not $PSCmdlet.ShouldProcess($target, 'Disable AIP Service super user feature')) {
            return
        }

        try {
            Write-Verbose "Disabling AIP Service super user feature."

            Invoke-SLProtectionCommand -OperationName 'Disable-AipServiceSuperUserFeature' -ScriptBlock {
                Disable-AipServiceSuperUserFeature
            }

            # Update state in elevation-state.json
            $statePath = $script:SLConfig.ElevationState
            $stateDir = Split-Path -Path $statePath -Parent
            if (-not (Test-Path -Path $stateDir)) {
                New-Item -Path $stateDir -ItemType Directory -Force | Out-Null
            }

            $state = @{}
            if (Test-Path -Path $statePath) {
                $state = Get-Content -Path $statePath -Raw | ConvertFrom-Json -AsHashtable
            }

            $state['SuperUser'] = @{
                Enabled    = $false
                DisabledAt = [datetime]::UtcNow.ToString('o')
                DisabledBy = $script:SLConnection.TenantId
            }

            $state | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth |
                Set-Content -Path $statePath -Encoding utf8

            Write-SLAuditEntry -Action 'Disable-SuperUser' -Target $target -Detail @{
                ElevationType = [SLElevationType]::SuperUser
            } -Result 'success'

            $result = [PSCustomObject]@{
                Action  = 'Disable-SuperUser'
                Target  = $target
                Enabled = $false
            }

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'Disable-SuperUser' -Target $target -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
