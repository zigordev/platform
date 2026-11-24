variable "adopt_existing" {
  type        = bool
  default     = true
  description = "Whether the plan imports the repo playground, which the owner created before this stack managed it"
}
