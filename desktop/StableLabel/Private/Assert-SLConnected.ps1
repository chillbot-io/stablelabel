function Assert-SLConnected {
    <#
    .SYNOPSIS
        Validates that required backends are connected.
    .DESCRIPTION
        Checks module-scoped connection state and throws a terminating error
        if the required backend is not connected. Called at the top of every
        public function's Begin block.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateSet('Graph', 'Compliance', 'Protection', 'All')]
        [string]$Require
    )

    $backends = switch ($Require) {
        'Graph'      { @('Graph') }
        'Compliance' { @('Compliance') }
        'Protection' { @('Protection') }
        'All'        { @('Graph', 'Compliance', 'Protection') }
    }

    foreach ($backend in $backends) {
        $key = "${backend}Connected"
        if (-not $script:SLConnection[$key]) {
            $connectCmd = switch ($backend) {
                'Graph'      { 'Connect-SLGraph' }
                'Compliance' { 'Connect-SLCompliance' }
                'Protection' { 'Connect-SLProtection' }
            }

            $extraInfo = ''
            if ($backend -eq 'Protection' -and -not $IsWindows) {
                $extraInfo = ' AIPService requires Windows PowerShell 5.1 and is not available on this platform.'
            }

            throw "Not connected to $backend. Run '$connectCmd' first.$extraInfo"
        }
    }
}
