function Connect-SLFileShare {
    <#
    .SYNOPSIS
        Mounts a CIFS/SMB file share and tracks it in module state.
    .DESCRIPTION
        Maps a UNC file share path as a PSDrive, optionally using explicit
        credentials or Windows integrated authentication (Kerberos/NTLM).
        The connection is tracked in the module-scoped $script:SLFileShares
        list so it can be managed and disconnected later.
    .PARAMETER Path
        UNC path to the share (e.g., \\server\share).
    .PARAMETER DriveLetter
        Optional drive letter to map (e.g., 'Z'). If omitted, an
        auto-generated PSDrive name is used.
    .PARAMETER Credential
        Optional explicit PSCredential. If omitted, Windows integrated
        authentication (Kerberos/NTLM) is used.
    .PARAMETER Name
        Friendly name for this share connection. Defaults to the share
        name extracted from the UNC path.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return the result as a JSON string instead of a PSCustomObject.
    .EXAMPLE
        Connect-SLFileShare -Path '\\server\share'
    .EXAMPLE
        Connect-SLFileShare -Path '\\server\finance' -DriveLetter 'Z' -Credential (Get-Credential)
    .EXAMPLE
        Connect-SLFileShare -Path '\\server\data' -Name 'DataShare' -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Path,

        [Parameter()]
        [ValidatePattern('^[A-Za-z]$')]
        [string]$DriveLetter,

        [Parameter()]
        [PSCredential]$Credential,

        [Parameter()]
        [string]$Name,

        [switch]$DryRun,

        [switch]$AsJson
    )

    process {
        # Initialize module-scoped file share tracking if needed
        if (-not $script:SLFileShares) {
            $script:SLFileShares = [System.Collections.Generic.List[hashtable]]::new()
        }

        # Parse UNC path to extract server and share name
        if ($Path -notmatch '^\\\\([^\\]+)\\([^\\]+)') {
            throw "Invalid UNC path '$Path'. Expected format: \\\\server\share"
        }
        $server    = $Matches[1]
        $shareName = $Matches[2]

        if (-not $Name) {
            $Name = $shareName
        }

        # Determine drive name
        if ($DriveLetter) {
            $driveName = $DriveLetter
        }
        else {
            $driveName = "SLShare_$($Name)_$(Get-Random -Minimum 1000 -Maximum 9999)"
        }

        $authType = if ($Credential) { 'Credential' } else { 'Integrated' }

        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'Connect-FileShare' -Target $Path -Detail @{
                Name       = $Name
                Server     = $server
                ShareName  = $shareName
                DriveName  = $driveName
                AuthType   = $authType
            } -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action      = 'Connect-FileShare'
                Name        = $Name
                Path        = $Path
                DriveLetter = $DriveLetter
                Server      = $server
                ShareName   = $shareName
                AuthType    = $authType
                DryRun      = $true
            }

            if ($AsJson) {
                return $dryRunResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }
            return $dryRunResult
        }

        if (-not $PSCmdlet.ShouldProcess($Path, 'Mount file share')) {
            return
        }

        $driveCreated = $false

        try {
            Write-Verbose "Mounting file share '$Name' at $Path (drive: $driveName, auth: $authType)."

            $driveParams = @{
                Name        = $driveName
                PSProvider  = 'FileSystem'
                Root        = $Path
                Persist     = $true
                ErrorAction = 'Stop'
            }

            if ($Credential) {
                $driveParams['Credential'] = $Credential
            }

            New-PSDrive @driveParams | Out-Null
            $driveCreated = $true

            # Verify access
            if (-not (Test-Path $Path)) {
                throw "Share mounted but path '$Path' is not accessible."
            }

            $connectedAt = [datetime]::UtcNow

            # Track in module state
            $script:SLFileShares.Add(@{
                Name        = $Name
                Path        = $Path
                DriveName   = $driveName
                DriveLetter = $DriveLetter
                ConnectedAt = $connectedAt
                Credential  = [bool]$Credential
            })

            Write-SLAuditEntry -Action 'Connect-FileShare' -Target $Path -Detail @{
                Name       = $Name
                Server     = $server
                ShareName  = $shareName
                DriveName  = $driveName
                AuthType   = $authType
            } -Result 'success'

            $result = [PSCustomObject]@{
                Name        = $Name
                Path        = $Path
                DriveLetter = $DriveLetter
                Server      = $server
                ShareName   = $shareName
                ConnectedAt = $connectedAt
                AuthType    = $authType
            }

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            # Clean up partially created PSDrive
            if ($driveCreated) {
                try { Remove-PSDrive -Name $driveName -Force -ErrorAction SilentlyContinue } catch { Write-Verbose "Remove-PSDrive cleanup failed: $($_.Exception.Message)" }
            }

            Write-SLAuditEntry -Action 'Connect-FileShare' -Target $Path -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
