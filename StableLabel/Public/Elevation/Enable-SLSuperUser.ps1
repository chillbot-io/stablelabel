function Enable-SLSuperUser {
    <#
    .SYNOPSIS
        Enables the AIP Service super user feature for the tenant.
    .DESCRIPTION
        Wraps Enable-AipServiceSuperUserFeature via Invoke-SLProtectionCommand.
        This is a Windows-only operation that requires the AIPService module.
        After enabling, the elevation state is recorded to the local
        elevation-state.json file for tracking purposes.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Enable-SLSuperUser
    .EXAMPLE
        Enable-SLSuperUser -DryRun
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
            Write-SLAuditEntry -Action 'Enable-SuperUser' -Target $target -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action = 'Enable-SuperUser'
                Target = $target
                DryRun = $true
            }

            if ($AsJson) {
                return $dryRunResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }
            return $dryRunResult
        }

        if (-not $PSCmdlet.ShouldProcess($target, 'Enable AIP Service super user feature')) {
            return
        }

        try {
            Write-Verbose "Enabling AIP Service super user feature."

            Invoke-SLProtectionCommand -OperationName 'Enable-AipServiceSuperUserFeature' -ScriptBlock {
                Enable-AipServiceSuperUserFeature
            }

            # Record state to elevation-state.json
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
                Enabled   = $true
                EnabledAt = [datetime]::UtcNow.ToString('o')
                EnabledBy = $script:SLConnection.TenantId
            }

            $state | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth |
                Set-Content -Path $statePath -Encoding utf8

            Write-SLAuditEntry -Action 'Enable-SuperUser' -Target $target -Detail @{
                ElevationType = [SLElevationType]::SuperUser
            } -Result 'success'

            $result = [PSCustomObject]@{
                Action  = 'Enable-SuperUser'
                Target  = $target
                Enabled = $true
            }

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'Enable-SuperUser' -Target $target -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
