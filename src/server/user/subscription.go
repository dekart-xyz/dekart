package user

type Subscription struct {
	ID            string // unique id of subscription
	EmailDomain   string // domain name of email
	AdminEmail    string // email of admin
	PersonalEmail bool   // true if email is personal and other users cannot subscribe to it
	MaxUsers      int    // max number of users that can use this subscription
	NumberOfUsers int    // number of users that use this subscription
}
