param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

if ($env:RELEASE_RUNS_JSON) {
  $runs = $env:RELEASE_RUNS_JSON | ConvertFrom-Json
  $successfulRuns = $runs
} else {
  $headers = @{
    Accept = 'application/vnd.github+json'
    Authorization = "Bearer $env:GITHUB_TOKEN"
    'X-GitHub-Api-Version' = '2022-11-28'
  }
  $url = "https://api.github.com/repos/$env:GITHUB_REPOSITORY/actions/workflows/publish.yml/runs?event=push&per_page=100"
  $runs = Invoke-RestMethod -Headers $headers -Uri $url
  $successUrl = "https://api.github.com/repos/$env:GITHUB_REPOSITORY/actions/workflows/publish.yml/runs?event=push&status=success&per_page=1"
  $successfulRuns = Invoke-RestMethod -Headers $headers -Uri $successUrl
}

$completedRuns = @(
  $runs.workflow_runs |
    Where-Object { "$($_.id)" -ne $env:GITHUB_RUN_ID -and $_.status -eq 'completed' } |
    Sort-Object created_at -Descending
)
$previousRun = $completedRuns | Select-Object -First 1
if ($previousRun -and $previousRun.conclusion -ne 'success') {
  Write-Output "::warning title=Previous publish failed::Run $($previousRun.id) ended with $($previousRun.conclusion). Commits will be collected from the last successful run."
}

$lastSuccess = @(
  $successfulRuns.workflow_runs |
    Where-Object { "$($_.id)" -ne $env:GITHUB_RUN_ID -and $_.conclusion -eq 'success' } |
    Sort-Object created_at -Descending
) | Select-Object -First 1
$baseSha = $null
if ($lastSuccess) {
  & git cat-file -e "$($lastSuccess.head_sha)^{commit}" 2>$null
  if ($LASTEXITCODE -eq 0) {
    $baseSha = $lastSuccess.head_sha
  } else {
    Write-Output "::warning title=Release base unavailable::Commit $($lastSuccess.head_sha) is not available locally. The full history will be used."
  }
}

$range = if ($baseSha) { "$baseSha..$env:GITHUB_SHA" } else { $env:GITHUB_SHA }
$commitRows = @(& git log --reverse '--format=%H%x09%s' $range)
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to read the Git commit history.'
}

$notes = [System.Collections.Generic.List[string]]::new()
$notes.Add('## 更新日志')
$notes.Add('')
foreach ($row in $commitRows) {
  if (-not $row) { continue }
  $parts = $row -split "`t", 2
  $sha = $parts[0]
  $subject = if ($parts.Count -gt 1) { $parts[1] } else { $sha }
  $shortSha = $sha.Substring(0, 7)
  $notes.Add("- $subject ([$shortSha](https://github.com/$env:GITHUB_REPOSITORY/commit/$sha))")
}
if ($commitRows.Count -eq 0) {
  $notes.Add('- 没有新的提交。')
}

$notes | Set-Content -Encoding utf8 $OutputPath
Write-Output "Release notes contain $($commitRows.Count) commit(s)."
if ($env:GITHUB_STEP_SUMMARY) {
  $baseLabel = if ($baseSha) { $baseSha } else { 'repository start' }
  "Release notes base: $baseLabel" | Add-Content -Encoding utf8 $env:GITHUB_STEP_SUMMARY
}
