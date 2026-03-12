function Invoke-SLWithRetry {
    <#
    .SYNOPSIS
        Executes a script block with exponential backoff retry logic.
    .DESCRIPTION
        Handles HTTP 429 (throttled), 503/504 (transient), and 423 (locked)
        errors with automatic retry. Respects Retry-After headers when present.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [scriptblock]$ScriptBlock,

        [int]$MaxRetries = 3,

        [int]$BaseDelaySeconds = 2,

        [string]$OperationName = 'Operation'
    )

    $attempt = 0
    while ($true) {
        $attempt++
        try {
            return & $ScriptBlock
        }
        catch {
            $statusCode = $null
            $retryAfter = $null

            if ($_.Exception.Response) {
                $statusCode = [int]$_.Exception.Response.StatusCode
                $retryAfter = $_.Exception.Response.Headers['Retry-After']
            }

            # Extract status code from error message if not in response
            if (-not $statusCode -and $_.Exception.Message -match '(\d{3})') {
                $candidate = [int]$Matches[1]
                if ($candidate -in 429, 503, 504, 423) {
                    $statusCode = $candidate
                }
            }

            $retryable = $statusCode -in 429, 503, 504, 423

            if (-not $retryable -or $attempt -gt $MaxRetries) {
                throw
            }

            $delay = if ($retryAfter) {
                [int]$retryAfter
            }
            else {
                [math]::Pow($BaseDelaySeconds, $attempt)
            }

            $delay = [math]::Min($delay, 60)

            Write-Verbose "[$OperationName] HTTP $statusCode on attempt $attempt/$MaxRetries. Retrying in ${delay}s..."
            Start-Sleep -Seconds $delay
        }
    }
}
