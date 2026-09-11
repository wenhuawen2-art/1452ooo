package authz.user

default allow := false

allow if {
  input.subject.auth_type == "administrator"
}

allow if {
  input.cloudbase.resource_type == "functions"
  startswith(input.request.path, "/v1/functions/suixing-api")
}
