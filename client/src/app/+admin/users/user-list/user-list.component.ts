import { SortMeta } from 'primeng/api'
import { Component, OnInit, ViewChild } from '@angular/core'
import { AuthService, ConfirmService, Notifier, RestPagination, RestTable, ServerService, UserService } from '@app/core'
import { Actor, DropdownAction } from '@app/shared/shared-main'
import { UserBanModalComponent } from '@app/shared/shared-moderation'
import { I18n } from '@ngx-translate/i18n-polyfill'
import { ServerConfig, User } from '@shared/models'
import { Params, Router, ActivatedRoute } from '@angular/router'

@Component({
  selector: 'my-user-list',
  templateUrl: './user-list.component.html',
  styleUrls: [ './user-list.component.scss' ]
})
export class UserListComponent extends RestTable implements OnInit {
  @ViewChild('userBanModal', { static: true }) userBanModal: UserBanModalComponent

  users: User[] = []
  totalRecords = 0
  sort: SortMeta = { field: 'createdAt', order: 1 }
  pagination: RestPagination = { count: this.rowsPerPage, start: 0 }

  selectedUsers: User[] = []
  bulkUserActions: DropdownAction<User[]>[][] = []

  private serverConfig: ServerConfig

  constructor (
    private notifier: Notifier,
    private confirmService: ConfirmService,
    private serverService: ServerService,
    private userService: UserService,
    private auth: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private i18n: I18n
  ) {
    super()
  }

  get authUser () {
    return this.auth.getUser()
  }

  get requiresEmailVerification () {
    return this.serverConfig.signup.requiresEmailVerification
  }

  ngOnInit () {
    this.serverConfig = this.serverService.getTmpConfig()
    this.serverService.getConfig()
        .subscribe(config => this.serverConfig = config)

    this.initialize()

    this.route.queryParams
      .subscribe(params => {
        this.search = params.search || ''

        this.setTableFilter(this.search)
        this.loadData()
      })

    this.bulkUserActions = [
      [
        {
          label: this.i18n('Delete'),
          description: this.i18n('Videos will be deleted, comments will be tombstoned.'),
          handler: users => this.removeUsers(users),
          isDisplayed: users => users.every(u => this.authUser.canManage(u))
        },
        {
          label: this.i18n('Ban'),
          description: this.i18n('User won\'t be able to login anymore, but videos and comments will be kept as is.'),
          handler: users => this.openBanUserModal(users),
          isDisplayed: users => users.every(u => this.authUser.canManage(u) && u.blocked === false)
        },
        {
          label: this.i18n('Unban'),
          handler: users => this.unbanUsers(users),
          isDisplayed: users => users.every(u => this.authUser.canManage(u) && u.blocked === true)
        }
      ],
      [
        {
          label: this.i18n('Set Email as Verified'),
          handler: users => this.setEmailsAsVerified(users),
          isDisplayed: users => {
            return this.requiresEmailVerification &&
              users.every(u => this.authUser.canManage(u) && !u.blocked && u.emailVerified === false)
          }
        }
      ]
    ]
  }

  getIdentifier () {
    return 'UserListComponent'
  }

  openBanUserModal (users: User[]) {
    for (const user of users) {
      if (user.username === 'root') {
        this.notifier.error(this.i18n('You cannot ban root.'))
        return
      }
    }

    this.userBanModal.openModal(users)
  }

  onUserChanged () {
    this.loadData()
  }

  /* Table filter functions */
  onUserSearch (event: Event) {
    this.onSearch(event)
    this.setQueryParams((event.target as HTMLInputElement).value)
  }

  setQueryParams (search: string) {
    const queryParams: Params = {}
    if (search) Object.assign(queryParams, { search })

    this.router.navigate([ '/admin/users/list' ], { queryParams })
  }

  resetTableFilter () {
    this.setTableFilter('')
    this.setQueryParams('')
    this.resetSearch()
  }
  /* END Table filter functions */

  switchToDefaultAvatar ($event: Event) {
    ($event.target as HTMLImageElement).src = Actor.GET_DEFAULT_AVATAR_URL()
  }

  async unbanUsers (users: User[]) {
    const message = this.i18n('Do you really want to unban {{num}} users?', { num: users.length })

    const res = await this.confirmService.confirm(message, this.i18n('Unban'))
    if (res === false) return

    this.userService.unbanUsers(users)
        .subscribe(
          () => {
            const message = this.i18n('{{num}} users unbanned.', { num: users.length })

            this.notifier.success(message)
            this.loadData()
          },

          err => this.notifier.error(err.message)
        )
  }

  async removeUsers (users: User[]) {
    for (const user of users) {
      if (user.username === 'root') {
        this.notifier.error(this.i18n('You cannot delete root.'))
        return
      }
    }

    const message = this.i18n('If you remove these users, you will not be able to create others with the same username!')
    const res = await this.confirmService.confirm(message, this.i18n('Delete'))
    if (res === false) return

    this.userService.removeUser(users).subscribe(
      () => {
        this.notifier.success(this.i18n('{{num}} users deleted.', { num: users.length }))
        this.loadData()
      },

      err => this.notifier.error(err.message)
    )
  }

  async setEmailsAsVerified (users: User[]) {
    this.userService.updateUsers(users, { emailVerified: true }).subscribe(
      () => {
        this.notifier.success(this.i18n('{{num}} users email set as verified.', { num: users.length }))
        this.loadData()
      },

      err => this.notifier.error(err.message)
    )
  }

  isInSelectionMode () {
    return this.selectedUsers.length !== 0
  }

  protected loadData () {
    this.selectedUsers = []

    this.userService.getUsers({
      pagination: this.pagination,
      sort: this.sort,
      search: this.search
    }).subscribe(
      resultList => {
        this.users = resultList.data
        this.totalRecords = resultList.total
      },

      err => this.notifier.error(err.message)
    )
  }
}
