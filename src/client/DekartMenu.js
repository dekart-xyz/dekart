import { Dropdown, Menu } from 'antd'
import styles from './DekartMenu.module.css'
import { ExportOutlined } from '@ant-design/icons'

const menu = (
  <Menu>
    <Menu.Item>
      <a href='/'>Reports</a>
    </Menu.Item>
    <Menu.Item>
      <a target='_blank' rel='noopener noreferrer' href='https://github.com/delfrrr/dekart'>GitHub <ExportOutlined /></a>
    </Menu.Item>
  </Menu>
)

export default function DekartMenu () {
  return (
    <div className={styles.dekartMenu}>
      <Dropdown overlay={menu} placement='bottomCenter'>
        <div className={styles.dekart}>Dekart</div>
      </Dropdown>
    </div>
  )
}
