#!/usr/bin/env bash
set -euo pipefail

mode="${1:-}"
case "$mode" in
  plan | drift | apply) ;;
  *)
    echo "Usage: infra/run.sh plan|drift|apply" >&2
    exit 2
    ;;
esac

root="${INFRA_ROOT:-$(cd "$(dirname "$0")" && pwd)}"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
outputs="${GITHUB_OUTPUT:-/dev/null}"
laptop_only="bootstrap"

hide() {
  if [ -n "${AWS_ACCOUNT_ID:-}" ]; then
    sed "s/${AWS_ACCOUNT_ID}/<account>/g"
  else
    cat
  fi
}

to_apply=()
drifted=()
failed=()

for dir in "$root"/*/; do
  dir="${dir%/}"
  stack="$(basename "$dir")"
  [ -f "$dir/providers.tf" ] || continue

  if [ "$mode" = "apply" ]; then
    if [ "$stack" = "$laptop_only" ]; then
      echo "$stack: applied from the laptop only, so the pipeline leaves it"
      continue
    fi
    tofu -chdir="$dir" init -input=false -lockfile=readonly -no-color > /dev/null
    tofu -chdir="$dir" apply -input=false -auto-approve -lock-timeout=120s -no-color | hide
    continue
  fi

  set +e
  tofu -chdir="$dir" init -input=false -lockfile=readonly -no-color > "$dir/init.log" 2>&1
  code=$?
  if [ "$code" -eq 0 ]; then
    tofu -chdir="$dir" plan -input=false -lock=false -detailed-exitcode -concise -no-color -out="$dir/pipeline.tfplan" > "$dir/plan.log" 2>&1
    code=$?
  else
    mv "$dir/init.log" "$dir/plan.log"
  fi
  set -e

  case "$code" in
    0)
      verdict="no changes"
      ;;
    2)
      drifted+=("$stack")
      if [ "$mode" = "drift" ]; then
        verdict="differs from the code"
      elif [ "$stack" = "$laptop_only" ]; then
        verdict="changes, applied from the laptop only, with the commands in docs/cloud-first-deploy.md"
      else
        verdict="changes, applied after the owner approves the run on main"
        to_apply+=("$stack")
      fi
      ;;
    *)
      verdict="the plan failed"
      failed+=("$stack")
      ;;
  esac

  echo "$stack: $verdict"
  {
    echo "### $stack: $verdict"
    echo
    echo "<details><summary>The plan</summary>"
    echo
    echo '```text'
    if [ "$code" -eq 2 ]; then
      tofu -chdir="$dir" show -no-color "$dir/pipeline.tfplan" | hide
    else
      hide < "$dir/plan.log"
    fi
    echo '```'
    echo
    echo "</details>"
    echo
  } >> "$summary"
  if [ "$code" -ne 0 ] && [ "$code" -ne 2 ]; then
    hide < "$dir/plan.log"
  fi
  rm -f "$dir/pipeline.tfplan" "$dir/plan.log" "$dir/init.log"
done

echo "apply=${to_apply[*]-}" >> "$outputs"

if [ "${#failed[@]}" -gt 0 ]; then
  echo "The plan failed for: ${failed[*]}" >&2
  exit 1
fi

if [ "$mode" = "drift" ] && [ "${#drifted[@]}" -gt 0 ]; then
  echo "AWS, GitHub or another provider differs from the code for: ${drifted[*]}" >&2
  exit 1
fi
